"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const logger_1 = require("./logger");
const type_resolve_helpers_1 = require("./type_resolve_helpers");
const PropTree_1 = require("./PropTree");
const declareModifier = ts.createModifier(ts.SyntaxKind.DeclareKeyword);
const constModifier = ts.createModifier(ts.SyntaxKind.ConstKeyword);
const readonlyModifier = ts.createModifier(ts.SyntaxKind.ReadonlyKeyword);
function validateClassLikeChildren(children, validate, msg) {
    if (children) {
        for (let i = children.length - 1; i >= 0; --i) {
            const child = children[i];
            if (!validate(child)) {
                logger_1.warn(`Encountered child that is not a ${msg}, this is likely due to invalid JSDoc.`, child);
                children.splice(i, 1);
            }
        }
    }
}
function validateClassChildren(children) {
    return validateClassLikeChildren(children, ts.isClassElement, 'ClassElement');
}
function validateInterfaceChildren(children) {
    return validateClassLikeChildren(children, ts.isTypeElement, 'TypeElement');
}
function validateModuleChildren(children) {
    if (children) {
        for (let i = children.length - 1; i >= 0; --i) {
            const child = children[i];
            if (!ts.isClassDeclaration(child)
                && !ts.isInterfaceDeclaration(child)
                && !ts.isFunctionDeclaration(child)
                && !ts.isEnumDeclaration(child)
                && !ts.isModuleDeclaration(child)
                && !ts.isTypeAliasDeclaration(child)
                && !ts.isVariableStatement(child)) {
                logger_1.warn('Encountered child that is not a supported declaration, this is likely due to invalid JSDoc.', child);
                children.splice(i, 1);
            }
        }
    }
}
function formatMultilineComment(comment) {
    return comment.split('\n').join('\n * ');
}
function handlePropsComment(props, jsdocTagName) {
    return props.map((prop) => {
        if (prop.description) {
            let name;
            if (prop.optional) {
                if (prop.defaultvalue !== undefined) {
                    name = `[${prop.name} = ${prop.defaultvalue}]`;
                }
                else {
                    name = `[${prop.name}]`;
                }
            }
            else {
                name = prop.name;
            }
            const description = ` - ${formatMultilineComment(prop.description)}`;
            return `\n * @${jsdocTagName} ${name}${description}`;
        }
        return '';
    }).filter((value) => value !== '').join('');
}
function handleReturnsComment(doclet) {
    if ('returns' in doclet) {
        return doclet['returns'].map((ret) => {
            if (ret.description) {
                return `\n * @returns ${formatMultilineComment(ret.description)}`;
            }
            return '';
        }).filter((value) => value !== '').join('');
    }
    return '';
}
function handleExamplesComment(doclet) {
    if (doclet.examples !== undefined) {
        return doclet.examples.map((example) => {
            return `\n * @example
 * ${formatMultilineComment(example)}`;
        }).join('');
    }
    return '';
}
function handleParamsComment(doclet) {
    if ('params' in doclet) {
        return handlePropsComment(doclet['params'], 'param');
    }
    return '';
}
function handlePropertiesComment(doclet) {
    if (doclet.properties && (!('isEnum' in doclet) || (doclet['isEnum'] === false))) {
        return handlePropsComment(doclet.properties, 'property');
    }
    return '';
}
function handleComment(doclet, node) {
    if (doclet.comment && doclet.comment.length > 4) {
        let description = '';
        if (doclet.description) {
            description = `\n * ${formatMultilineComment(doclet.description)}`;
        }
        else if ('classdesc' in doclet) {
            description = `\n * ${formatMultilineComment(doclet['classdesc'])}`;
        }
        const examples = handleExamplesComment(doclet);
        const properties = handlePropertiesComment(doclet);
        const params = handleParamsComment(doclet);
        const returns = handleReturnsComment(doclet);
        if (description || examples || properties || params || returns) {
            let comment = `*${description}${examples}${properties}${params}${returns}
 `;
            const kind = ts.SyntaxKind.MultiLineCommentTrivia;
            ts.addSyntheticLeadingComment(node, kind, comment, true);
        }
    }
    return node;
}
function createClass(doclet, children) {
    validateClassChildren(children);
    const mods = doclet.memberof ? undefined : [declareModifier];
    const members = children || [];
    const typeParams = type_resolve_helpers_1.resolveTypeParameters(doclet);
    const heritageClauses = type_resolve_helpers_1.resolveHeritageClauses(doclet, false);
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    if (doclet.params) {
        const params = type_resolve_helpers_1.createFunctionParams(doclet);
        members.unshift(ts.createConstructor(undefined, undefined, params, undefined));
    }
    if (doclet.properties) {
        const tree = new PropTree_1.PropTree(doclet.properties);
        for (let i = 0; i < tree.roots.length; ++i) {
            const node = tree.roots[i];
            const opt = node.prop.optional ? ts.createToken(ts.SyntaxKind.QuestionToken) : undefined;
            const t = node.children.length ? type_resolve_helpers_1.createTypeLiteral(node.children) : type_resolve_helpers_1.resolveType(node.prop.type);
            const property = ts.createProperty(undefined, undefined, node.name, opt, t, undefined);
            if (node.prop.description) {
                let comment = `*\n * ${node.prop.description.split(/\r\s*/).join("\n * ")}\n`;
                ts.addSyntheticLeadingComment(property, ts.SyntaxKind.MultiLineCommentTrivia, comment, true);
            }
            members.push(property);
        }
    }
    return handleComment(doclet, ts.createClassDeclaration(undefined, mods, doclet.name, typeParams, heritageClauses, members));
}
exports.createClass = createClass;
function createInterface(doclet, children) {
    validateInterfaceChildren(children);
    const mods = doclet.memberof ? undefined : [declareModifier];
    const members = children;
    const typeParams = type_resolve_helpers_1.resolveTypeParameters(doclet);
    const heritageClauses = type_resolve_helpers_1.resolveHeritageClauses(doclet, true);
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    return handleComment(doclet, ts.createInterfaceDeclaration(undefined, mods, doclet.name, typeParams, heritageClauses, members));
}
exports.createInterface = createInterface;
function createFunction(doclet) {
    const mods = doclet.memberof ? undefined : [declareModifier];
    const params = type_resolve_helpers_1.createFunctionParams(doclet);
    const type = type_resolve_helpers_1.createFunctionReturnType(doclet);
    const typeParams = type_resolve_helpers_1.resolveTypeParameters(doclet);
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    return handleComment(doclet, ts.createFunctionDeclaration(undefined, mods, undefined, doclet.name, typeParams, params, type, undefined));
}
exports.createFunction = createFunction;
function createClassMethod(doclet) {
    const mods = [];
    const params = type_resolve_helpers_1.createFunctionParams(doclet);
    const type = type_resolve_helpers_1.createFunctionReturnType(doclet);
    const typeParams = type_resolve_helpers_1.resolveTypeParameters(doclet);
    if (!doclet.memberof)
        mods.push(declareModifier);
    if (doclet.access === 'private')
        mods.push(ts.createModifier(ts.SyntaxKind.PrivateKeyword));
    else if (doclet.access === 'protected')
        mods.push(ts.createModifier(ts.SyntaxKind.ProtectedKeyword));
    else if (doclet.access === 'public')
        mods.push(ts.createModifier(ts.SyntaxKind.PublicKeyword));
    if (doclet.scope === 'static')
        mods.push(ts.createModifier(ts.SyntaxKind.StaticKeyword));
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    const [name, questionToken] = type_resolve_helpers_1.resolveOptionalFromName(doclet);
    return handleComment(doclet, ts.createMethod(undefined, mods, undefined, name, questionToken, typeParams, params, type, undefined));
}
exports.createClassMethod = createClassMethod;
function createInterfaceMethod(doclet) {
    const mods = [];
    const params = type_resolve_helpers_1.createFunctionParams(doclet);
    const type = type_resolve_helpers_1.createFunctionReturnType(doclet);
    const typeParams = type_resolve_helpers_1.resolveTypeParameters(doclet);
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    const [name, questionToken] = type_resolve_helpers_1.resolveOptionalFromName(doclet);
    return handleComment(doclet, ts.createMethodSignature(typeParams, params, type, name, questionToken));
}
exports.createInterfaceMethod = createInterfaceMethod;
function createEnum(doclet) {
    const mods = [];
    const props = [];
    if (!doclet.memberof)
        mods.push(declareModifier);
    if (doclet.kind === 'constant')
        mods.push(constModifier);
    if (doclet.properties && doclet.properties.length) {
        for (let i = 0; i < doclet.properties.length; ++i) {
            const p = doclet.properties[i];
            const l = p.defaultvalue !== undefined ? ts.createLiteral(p.defaultvalue) : undefined;
            props.push(ts.createEnumMember(p.name, l));
        }
    }
    return handleComment(doclet, ts.createEnumDeclaration(undefined, mods, doclet.name, props));
}
exports.createEnum = createEnum;
function createClassMember(doclet) {
    const mods = [];
    const type = type_resolve_helpers_1.resolveType(doclet.type, doclet);
    if (doclet.access === 'private')
        mods.push(ts.createModifier(ts.SyntaxKind.PrivateKeyword));
    else if (doclet.access === 'protected')
        mods.push(ts.createModifier(ts.SyntaxKind.ProtectedKeyword));
    else if (doclet.access === 'public')
        mods.push(ts.createModifier(ts.SyntaxKind.PublicKeyword));
    if (doclet.scope === 'static')
        mods.push(ts.createModifier(ts.SyntaxKind.StaticKeyword));
    if (doclet.kind === 'constant' || doclet.readonly)
        mods.push(readonlyModifier);
    const [name, questionToken] = type_resolve_helpers_1.resolveOptionalFromName(doclet);
    return handleComment(doclet, ts.createProperty(undefined, mods, name, questionToken, type, undefined));
}
exports.createClassMember = createClassMember;
function createInterfaceMember(doclet) {
    const mods = [];
    const type = type_resolve_helpers_1.resolveType(doclet.type, doclet);
    if (doclet.kind === 'constant')
        mods.push(readonlyModifier);
    if (doclet.scope === 'static')
        mods.push(ts.createModifier(ts.SyntaxKind.StaticKeyword));
    const [name, questionToken] = type_resolve_helpers_1.resolveOptionalFromName(doclet);
    return handleComment(doclet, ts.createPropertySignature(mods, name, questionToken, type, undefined));
}
exports.createInterfaceMember = createInterfaceMember;
function createNamespaceMember(doclet) {
    const mods = doclet.memberof ? undefined : [declareModifier];
    const flags = (doclet.kind === 'constant' || doclet.readonly) ? ts.NodeFlags.Const : undefined;
    const literalValue = doclet.defaultvalue !== undefined ? doclet.defaultvalue
        : doclet.meta && doclet.meta.code.type === 'Literal' ? doclet.meta.code.value
            : undefined;
    const initializer = (flags === ts.NodeFlags.Const && literalValue !== undefined) ? ts.createLiteral(literalValue) : undefined;
    const type = initializer ? undefined : type_resolve_helpers_1.resolveType(doclet.type, doclet);
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    return handleComment(doclet, ts.createVariableStatement(mods, ts.createVariableDeclarationList([
        ts.createVariableDeclaration(doclet.name, type, initializer)
    ], flags)));
}
exports.createNamespaceMember = createNamespaceMember;
function createModule(doclet, nested, children) {
    validateModuleChildren(children);
    const mods = doclet.memberof ? undefined : [declareModifier];
    let body = undefined;
    let flags = ts.NodeFlags.None;
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    if (nested)
        flags |= ts.NodeFlags.NestedNamespace;
    if (children)
        body = ts.createModuleBlock(children);
    const name = ts.createStringLiteral(doclet.name);
    return handleComment(doclet, ts.createModuleDeclaration(undefined, mods, name, body, flags));
}
exports.createModule = createModule;
function createNamespace(doclet, nested, children) {
    validateModuleChildren(children);
    const mods = doclet.memberof ? undefined : [declareModifier];
    let body = undefined;
    let flags = ts.NodeFlags.Namespace;
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    if (nested)
        flags |= ts.NodeFlags.NestedNamespace;
    if (children) {
        body = ts.createModuleBlock(children);
    }
    const name = ts.createIdentifier(doclet.name);
    return handleComment(doclet, ts.createModuleDeclaration(undefined, mods, name, body, flags));
}
exports.createNamespace = createNamespace;
function createTypedef(doclet, children) {
    const mods = doclet.memberof ? undefined : [declareModifier];
    const type = type_resolve_helpers_1.resolveType(doclet.type, doclet);
    const typeParams = type_resolve_helpers_1.resolveTypeParameters(doclet);
    if (doclet.name.startsWith('exports.'))
        doclet.name = doclet.name.replace('exports.', '');
    return handleComment(doclet, ts.createTypeAliasDeclaration(undefined, mods, doclet.name, typeParams, type));
}
exports.createTypedef = createTypedef;
//# sourceMappingURL=create_helpers.js.map