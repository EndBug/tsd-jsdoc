"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const logger_1 = require("./logger");
const assert_never_1 = require("./assert_never");
const create_helpers_1 = require("./create_helpers");
function isClassLike(doclet) {
    return doclet.kind === 'class' || doclet.kind === 'interface' || doclet.kind === 'mixin';
}
function isModuleLike(doclet) {
    return doclet.kind === 'module' || doclet.kind === 'namespace';
}
function isEnum(doclet) {
    return (doclet.kind === 'member' || doclet.kind === 'constant') && doclet.isEnum;
}
function shouldMoveOutOfClass(doclet) {
    return isClassLike(doclet)
        || isModuleLike(doclet)
        || isEnum(doclet)
        || doclet.kind === 'typedef';
}
class Emitter {
    constructor(options) {
        this.options = options;
        this.results = [];
        this._treeRoots = [];
        this._treeNodes = {};
    }
    parse(docs) {
        this.results = [];
        this._treeRoots = [];
        this._treeNodes = {};
        if (!docs)
            return;
        this._createTreeNodes(docs);
        this._buildTree(docs);
        this._parseTree();
    }
    emit() {
        const resultFile = ts.createSourceFile('types.d.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
        const printer = ts.createPrinter({
            removeComments: false,
            newLine: ts.NewLineKind.LineFeed,
        });
        let out2 = '';
        for (let i = 0; i < this.results.length; ++i) {
            out2 += printer.printNode(ts.EmitHint.Unspecified, this.results[i], resultFile);
            out2 += '\n\n';
        }
        return out2;
    }
    _createTreeNodes(docs) {
        for (let i = 0; i < docs.length; ++i) {
            const doclet = docs[i];
            if (doclet.kind === 'package' || this._ignoreDoclet(doclet))
                continue;
            if (!this._treeNodes[doclet.longname]) {
                this._treeNodes[doclet.longname] = { doclet, children: [] };
            }
        }
    }
    _buildTree(docs) {
        for (let i = 0; i < docs.length; ++i) {
            const doclet = docs[i];
            if (doclet.kind === 'package' || this._ignoreDoclet(doclet))
                continue;
            const obj = this._treeNodes[doclet.longname];
            if (!obj) {
                logger_1.warn('Failed to find doclet node when building tree, this is likely a bug.', doclet);
                continue;
            }
            let interfaceMerge = null;
            if (doclet.kind === 'class') {
                const impls = doclet.implements || [];
                const mixes = doclet.mixes || [];
                const extras = impls.concat(mixes);
                if (extras.length) {
                    const longname = this._getInterfaceKey(doclet.longname);
                    interfaceMerge = this._treeNodes[longname] = {
                        doclet: {
                            kind: 'interface',
                            name: doclet.name,
                            scope: doclet.scope,
                            longname: longname,
                            augments: extras,
                            memberof: doclet.memberof,
                        },
                        children: [],
                    };
                }
            }
            let namespaceMerge = null;
            if (doclet.kind === 'interface' || doclet.kind === 'mixin') {
                const staticChildren = docs.filter(d => d.memberof === doclet.longname && d.scope === 'static');
                if (staticChildren.length) {
                    const longname = this._getNamespaceKey(doclet.longname);
                    namespaceMerge = this._treeNodes[longname] = {
                        doclet: {
                            kind: 'namespace',
                            name: doclet.name,
                            scope: doclet.scope,
                            longname: longname,
                            memberof: doclet.memberof,
                        },
                        children: [],
                    };
                    staticChildren.forEach(c => c.memberof = longname);
                }
            }
            if (doclet.memberof) {
                const parent = this._treeNodes[doclet.memberof];
                if (!parent) {
                    logger_1.warn(`Failed to find parent of doclet '${doclet.longname}' using memberof '${doclet.memberof}', this is likely due to invalid JSDoc.`, doclet);
                    continue;
                }
                const isParentClassLike = isClassLike(parent.doclet);
                if (isParentClassLike && shouldMoveOutOfClass(doclet)) {
                    const mod = this._getOrCreateClassNamespace(parent);
                    if (interfaceMerge)
                        mod.children.push(interfaceMerge);
                    if (namespaceMerge)
                        mod.children.push(namespaceMerge);
                    mod.children.push(obj);
                }
                else {
                    const isObjModuleLike = isModuleLike(doclet);
                    const isParentModuleLike = isModuleLike(parent.doclet);
                    if (isObjModuleLike && isParentModuleLike)
                        obj.isNested = true;
                    const isParentEnum = isEnum(parent.doclet);
                    if (!isParentEnum) {
                        if (interfaceMerge)
                            parent.children.push(interfaceMerge);
                        if (namespaceMerge)
                            parent.children.push(namespaceMerge);
                        parent.children.push(obj);
                    }
                }
            }
            else {
                if (interfaceMerge)
                    this._treeRoots.push(interfaceMerge);
                if (namespaceMerge)
                    this._treeRoots.push(namespaceMerge);
                this._treeRoots.push(obj);
            }
        }
    }
    _parseTree() {
        for (let i = 0; i < this._treeRoots.length; ++i) {
            const node = this._parseTreeNode(this._treeRoots[i]);
            if (node)
                this.results.push(node);
        }
    }
    _parseTreeNode(node, parent) {
        const children = [];
        if (children) {
            for (let i = 0; i < node.children.length; ++i) {
                const childNode = this._parseTreeNode(node.children[i], node);
                if (childNode)
                    children.push(childNode);
            }
        }
        switch (node.doclet.kind) {
            case 'class':
                return create_helpers_1.createClass(node.doclet, children);
            case 'constant':
            case 'member':
                if (node.doclet.isEnum)
                    return create_helpers_1.createEnum(node.doclet);
                else if (parent && parent.doclet.kind === 'class')
                    return create_helpers_1.createClassMember(node.doclet);
                else if (parent && parent.doclet.kind === 'interface')
                    return create_helpers_1.createInterfaceMember(node.doclet);
                else
                    return create_helpers_1.createNamespaceMember(node.doclet);
            case 'callback':
            case 'function':
                if (node.doclet.memberof) {
                    const parent = this._treeNodes[node.doclet.memberof];
                    if (parent && parent.doclet.kind === 'class')
                        return create_helpers_1.createClassMethod(node.doclet);
                    else if (parent && parent.doclet.kind === 'interface')
                        return create_helpers_1.createInterfaceMethod(node.doclet);
                }
                return create_helpers_1.createFunction(node.doclet);
            case 'interface':
                return create_helpers_1.createInterface(node.doclet, children);
            case 'mixin':
                return create_helpers_1.createInterface(node.doclet, children);
            case 'module':
                return create_helpers_1.createModule(node.doclet, !!node.isNested, children);
            case 'namespace':
                return create_helpers_1.createNamespace(node.doclet, !!node.isNested, children);
            case 'typedef':
                return create_helpers_1.createTypedef(node.doclet, children);
            case 'file':
                return null;
            case 'event':
                return null;
            default:
                return assert_never_1.assertNever(node.doclet);
        }
    }
    _ignoreDoclet(doclet) {
        if (doclet.kind === 'package'
            || doclet.ignore
            || (!this.options.private && doclet.access === 'private')) {
            return true;
        }
        if (doclet.access === undefined) {
            return false;
        }
        const accessLevels = ["private", "package", "protected", "public"];
        return accessLevels.indexOf(doclet.access.toString()) < accessLevels.indexOf(this.options.access || "package");
    }
    _getInterfaceKey(longname) {
        return longname ? longname + '$$interface$helper' : '';
    }
    _getNamespaceKey(longname) {
        return longname ? longname + '$$namespace$helper' : '';
    }
    _getOrCreateClassNamespace(obj) {
        if (obj.doclet.kind === 'namespace')
            return obj;
        const namespaceKey = this._getNamespaceKey(obj.doclet.longname);
        let mod = this._treeNodes[namespaceKey];
        if (mod)
            return mod;
        mod = this._treeNodes[namespaceKey] = {
            doclet: {
                kind: 'namespace',
                name: obj.doclet.name,
                scope: 'static',
                longname: namespaceKey,
            },
            children: [],
        };
        if (obj.doclet.memberof) {
            const parent = this._treeNodes[obj.doclet.memberof];
            if (!parent) {
                logger_1.warn(`Failed to find parent of doclet '${obj.doclet.longname}' using memberof '${obj.doclet.memberof}', this is likely due to invalid JSDoc.`, obj.doclet);
                return mod;
            }
            let parentMod = this._getOrCreateClassNamespace(parent);
            mod.doclet.memberof = parentMod.doclet.longname;
            parentMod.children.push(mod);
        }
        else {
            this._treeRoots.push(mod);
        }
        return mod;
    }
}
exports.Emitter = Emitter;
//# sourceMappingURL=Emitter.js.map