(function (NAME, window, factory) {
    "use strict";

    window[NAME] = factory();

}("Lang", self, function () {

    /** @param code {string}  */
    function parse(code) {
        const ast = {
            t: "ROOT",
            d: [],
        }
        const groups = [ast];
        let pos = 0;
        let col = 1;
        let row = 1;
        let t = null;
        let c = '';
        let prev = '';
        let s = [];
        let group = ast;
        let expr = null;
        while (t = code[pos]) {
            expr = {
                t: "",
                v: "",
                pos: pos,
                col: col,
                row: row,
            }
            s = []
            switch (t) {
                case "\t":
                    throw new Error("FIXME: Tabs are not allowed right now!");
                case ";":
                    expr.t = "COMMENT";
                    while (c = code[pos]) {
                        if (c === "\n") {
                            break;
                        }
                        s.push(c);
                        pos += 1;
                        col += 1;
                    }
                    expr.v = s.join("");
                    group.d.push(expr);
                    break;
                case "\n":
                case " ":
                    expr.t = "WHITESPACE";
                    while (c = code[pos]) {
                        if (c === "\n") {
                            s.push(c);
                            row += 1;
                            col = 1;
                            pos += 1;
                        }
                        else if (c === " ") {
                            s.push(c);
                            pos += 1;
                            col += 1;
                        }
                        else {
                            break;
                        }
                    }
                    expr.v = s.join("");
                    group.d.push(expr);
                    break;
                case "(": // Intentional fallthrough
                case "[": // Intentional fallthrough
                case "{":
                    group = {
                        t: t === "(" ? "CALL" : t === "[" ? "VECTOR" : "MAP",
                        d: [],
                        pos: pos,
                        col: col,
                        row: row,
                    }
                    groups[groups.length - 1].d.push(group);
                    groups.push(group);
                    pos += 1;
                    col += 1;
                    break;
                case ")": // Intentional fallthrough
                case "]": // Intentional fallthrough
                case "}":
                    groups.pop();
                    group = groups[groups.length - 1];
                    pos += 1;
                    col += 1;
                    break;
                case '"':
                    if (code.substr(pos, 3) === '"""') {
                        expr.t = "MULTI";
                        prev = t;
                        pos += 3;
                        col += 3;
                        while (c = code[pos]) {
                            if (!/\\/.test(prev) && code.substr(pos, 3) === '"""') {
                                pos += 3;
                                col += 3;
                                break;
                            }
                            s.push(c);
                            prev = c;
                            pos += 1;
                            col += 1;
                        }
                        expr.v = s.join("");
                        group.d.push(expr);
                    } else {
                        expr.t = "STRING";
                        prev = t;
                        pos += 1;
                        col += 1;
                        while (c = code[pos]) {
                            if (!/\\/.test(prev) && /"/.test(c)) {
                                pos += 1;
                                col += 1;
                                break;
                            }
                            s.push(c);
                            prev = c;
                            pos += 1;
                            col += 1;
                        }
                        expr.v = s.join("");
                        group.d.push(expr);
                    }
                    break;
                case ":":
                    expr.t = "KEYWORD";
                    s.push(":");
                    pos += 1;
                    col += 1;
                    while (c = code[pos]) {
                        if (/[()\n ;\[\]{}:]/.test(c)) {
                            break;
                        }
                        s.push(c);
                        pos += 1;
                        col += 1;
                    }
                    expr.v = s.join("");
                    group.d.push(expr);
                    break;
                default:
                    expr.t = /^[0-9]/.test(t) ? "NUMBER" : "IDENT";
                    while (c = code[pos]) {
                        if (/[()\n ;\[\]{}:]/.test(c)) {
                            break;
                        }
                        s.push(c);
                        pos += 1;
                        col += 1;
                    }
                    expr.v = s.join("");
                    group.d.push(expr);
                    break;
            }
        }
        return ast;
    }

    function traverse(visitors, ast, type) {
        const t = type || "t";
        const stack = [ast];
        let node = null;
        let visit = null;
        let descendants = null;
        let k = 0;

        while (stack.length) {
            node = stack[0];
            k += 1;
            node.id = k;
            stack.splice(0, 1);
            visit = visitors[node[t]];
            descendants = node.d;
            if (visit) {
                descendants = visit(node) || node.d;
            }
            descendants && descendants.forEach(function (descendant) {
                // TODO: Maybe it's better to reference nodes by id to not introduce cycles?
                descendant.p = k;
                descendant.pp = node;
            });
            if (descendants) {
                stack.splice.apply(stack, [0, 0].concat(descendants));
            }
        }
    }

    function surround(pre, post) {
        return function (node) {
            const result = node.d.slice();
            result.splice(0, 0, { t: "X_ADORN", v: pre });
            result.push({ t: "X_ADORN", v: post });
            return result;
        };
    }

    function print(ast) {
        const s = [];

        function emitValue(node) {
            s.push(node.v);
        }

        traverse({
            CALL: surround("(", ")"),
            COMMENT: emitValue,
            IDENT: emitValue,
            KEYWORD: emitValue,
            MAP: surround("{", "}"),
            MULTI: function (node) {
                s.push('"""' + node.v + '"""');
            },
            NUMBER: emitValue,
            STRING: function (node) {
                s.push('"' + node.v + '"');
            },
            VECTOR: surround("[", "]"),
            WHITESPACE: emitValue,
            X_ADORN: emitValue,
        }, ast);

        return s.join("");
    }

    function clone(it) {
        return JSON.parse(JSON.stringify(it));
    }

    function annotate(raw) {
        const ast = clone(raw);

        function mark(node) {
            node.tt = node.tt || node.t;
        }

        function CALL(node) {
            let args = [];
            let names = [];
            let meta = [];

            let i = 0;
            let child = node.d[i];
            loop: while (child) {
                switch (child.t) {
                    case "IDENT":
                        names.push(child);
                        break;
                    case "KEYWORD":
                        meta.push(child);
                        break;
                    case "MAP":
                        meta.push(child);
                        break;
                    case "MULTI":
                        child.tt = "DOCS";
                        meta.push(child);
                        break;
                    case "VECTOR":
                        child.tt = "ARGS";
                        args = child;
                        break;
                    case "WHITESPACE":
                        break;
                    default:
                        break loop;
                }
                i += 1;
                child = node.d[i];
            }

            switch (names[0].v) {
                case "export":
                    node.tt = "EXPORT";
                    break;
                case "fn":
                    node.tt = "FN";
                    node.args = args;
                    node.name = names[1] ? names[1].v : null;
                    node.meta = meta;
                    names.forEach(function (name) {
                        name.tt = "FNAME";
                        name.ignore = true;
                    });
                    break;
                case "import":
                    node.tt = "IMPORT";
                    break;
                case "let":
                    node.tt = "LET";
                    names[0].tt = "LNAME";
                    names[0].ignore = true;
                    break;
                case "module":
                    node.tt = "MODULE";
                    node.args = args;
                    node.name = names[1] ? names[1].v : null;
                    node.meta = meta;
                    node.exports = [];
                    node.imports = [];
                    names.forEach(function (name) {
                        name.tt = "MNAME";
                        name.ignore = true;
                    });
                    node.d && node.d.forEach(function (child) {
                        if (child.t === "CALL") {
                            // TODO: Maybe calling CALL recursively isn't a good idea?
                            CALL(child);
                        }
                        if (child.tt === "IMPORT") {
                            child.ignore = true;
                            node.imports.push(child);
                        }
                        if (child.tt === "EXPORT") {
                            child.ignore = true;
                            node.exports.push(child);
                        }
                    });
                    break;
                default:
                    node.name = names[0] ? names[0].v : null;
                    names[0].tt = "CNAME";
                    names[0].ignore = true;
                    node.tt = node.tt || node.t;
                    break;
            }
        }

        traverse({
            ROOT: mark,
            CALL: CALL,
            IDENT: mark,
            NUMBER: mark,
            STRING: mark,
            WHITESPACE: mark,
        }, ast);

        return ast;
    }

    function generate(ast) {
        const out = [];
        const cfg = {
            ROOT: function (node) {
                out.push("var ROOT_SCOPE = (function (scope) {\n")
                const d = node.d.slice();
                d.push({ tt: "X_ADORN", v: ";return scope;}(Object.create(null)));\n" });
                return d;
            },
            MODULE: function (node) {
                // console.log("MODULE", node);
                const d = node.d.slice();
                // TODO: We need to handle weird module names!
                const name = node.name || "";
                if (name) {
                    out.push("scope['" + name + "'] = ");
                    out.push("function (" + ") {\nvar scope=Object.create(scope);\n");
                    d.push({ tt: "X_ADORN", v: "}\n" });
                } else {
                    out.push("(function () {\nvar scope=Object.create(scope);\n");
                    d.push({ tt: "X_ADORN", v: "}());\n" });
                }
                return d;
            },
            FN: function (node) {
                // console.log("FN", node);
                const d = node.d.slice();
                // TODO: We need to handle weird module names!
                const name = node.name || "";
                const args = node.args && node.args.d && node.args.d.map(function (arg) {
                    return arg.v;
                }) || [];
                if (name) {
                    out.push("scope['" + name + "'] = ");
                }
                out.push("function (" + args.join(", ") + ") {\nvar scope=Object.create(scope);\n");
                d.push({ tt: "X_ADORN", v: "}\n" });
                return d;
            },
            LET: function (node) {
                let i = 0;
                let stack = [];
                while (i < node.d.length) {
                    // console.log("LET...", node.d[i]);
                    let n = node.d[i];
                    if (n.ignore || n.tt === "WHITESPACE") {
                        i += 1;
                        continue;
                    }
                    stack.push(n);
                    if (stack.length % 2 === 0) {
                        const key = stack[stack.length - 2].v;
                        out.push("scope['" + key + "'] = ");
                        const subtree = stack[stack.length - 1];
                        // console.log(key, '=>', subtree);
                        traverse(cfg, subtree, "tt");
                        out.push(";");
                    }
                    i += 1;
                }
                return [];
            },
            CALL: function (node) {
                const name = node.name;
                out.push("scope['" + name + "'](");
                node.d.forEach(function (child) {
                    if (child.ignore || child.tt === "WHITESPACE") {
                        return;
                    }
                    traverse(cfg, child, "tt");
                    out.push(",");
                })
                out.push(")");
                return [];
            },
            // MULTI: function (node) {
            //     out.push('`' + node.v + '`');
            // },
            NUMBER: function (node) {
                out.push(node.v);
            },
            STRING: function (node) {
                out.push('"' + node.v + '"');
            },
            // CALL: function (node) {
            //     if (node.ignore) {
            //         return;
            //     }
            //     let i = 0;
            //     let child = node.d[i];

            //     while (child) {
            //         switch (child.t) {
            //             case "IDENT":
            //                 names.push(child.v);
            //                 break;
            //             case "MULTI":
            //                 docs.push(child.v);
            //                 break;
            //             default:
            //                 realChildren.push(child);
            //                 break;
            //         }
            //         i += 1;
            //         child = node.d[i];
            //     }

            //     if (docs.length) {
            //         out.push("/**\n");
            //         out.push(...docs);
            //         out.push("\n*/\n");
            //     }
            //     if (names[0] === "module" || names[0] === "fn") {
            //         out.push("function " + (names[1] || names[0]) + "(" + ") ");
            //         realChildren.splice(0, 0, { t: "X_ADORN", v: "{\n" });
            //         realChildren.push({ t: "X_ADORN", v: "}\n" });
            //     } else {
            //         out.push(names[0]);
            //         realChildren.splice(0, 0, { t: "X_ADORN", v: "(" });
            //         realChildren.push({ t: "X_ADORN", v: ")\n" });
            //     }
            //     return realChildren;
            // },
            // COMMENT: emitValue,
            IDENT: function (node) {
                // console.log("IDENT", node);
                out.push(node.v);
            },
            // KEYWORD: emitValue,
            // MAP: surround("{", "}"),
            // VECTOR: surround("[", "]"),
            // WHITESPACE: emitValue,
            X_ADORN: function (node) {
                out.push(node.v);
            },
        }

        traverse(cfg, ast, "tt");

        return out.join("");
    }

    return {
        annotate: annotate,
        compile: function (code) {
            return generate(annotate(parse(code)));
        },
        generate: generate,
        parse: parse,
        print: print,
        traverse: traverse,
    };
}))

