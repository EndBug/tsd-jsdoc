"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const helper = require("jsdoc/util/templateHelper");
const Emitter_1 = require("./Emitter");
const logger_1 = require("./logger");
function publish(data, opts) {
    data({ undocumented: true }).remove();
    const docs = data().get();
    logger_1.setVerbose(!!opts.verbose);
    const emitter = new Emitter_1.Emitter(opts);
    emitter.parse(docs);
    if (opts.destination === 'console') {
        console.log(emitter.emit());
    }
    else {
        try {
            fs.mkdirSync(opts.destination);
        }
        catch (e) {
            if (e.code !== 'EEXIST') {
                throw e;
            }
        }
        const pkgArray = helper.find(data, { kind: 'package' }) || [];
        const pkg = pkgArray[0];
        let definitionName = 'types';
        if (pkg && pkg.name) {
            definitionName = pkg.name.split('/').pop() || definitionName;
        }
        const out = path.join(opts.destination, opts.outFile || `${definitionName}.d.ts`);
        fs.writeFileSync(out, emitter.emit());
    }
}
exports.publish = publish;
//# sourceMappingURL=publish.js.map