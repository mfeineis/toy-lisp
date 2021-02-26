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
                    expr.t = /^[0-9\-]/.test(t) ? "NUMBER" : "IDENT";
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
                // descendant.pp = node;
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

            // `let` is a special form that doesn't change the semantics of its children
            let isLet = false;
            let i = 0;
            let child = node.d[i];
            loop: while (child) {
                switch (child.t) {
                    case "IDENT":
                        names.push(child);
                        if (names.length === 1 && child.v === "let") {
                            isLet = true;
                        }
                        break;
                    case "KEYWORD":
                        if (isLet) {
                            break;
                        }
                        // TODO: Can keywords be called as getters?
                        // if (names.length === 0) {
                        //     names.push(child);
                        // }
                        meta.push(child);
                        break;
                    case "MAP":
                        if (isLet) {
                            break;
                        }
                        meta.push(child);
                        break;
                    case "MULTI":
                        if (isLet) {
                            break;
                        }
                        child.tt = "DOCS";
                        meta.push(child);
                        break;
                    case "VECTOR":
                        if (isLet) {
                            break;
                        }
                        // console.log("CALL", "...", "VECTOR", child, { names, meta, args })
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
                    names[0].tt = "ENAME";
                    names[0].ignore = true;
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
                    meta.forEach(function (m) {
                        m.ignore = true;
                    });
                    break;
                case "import":
                    node.tt = "IMPORT";
                    node.name = names[1] ? names[1].v : null;
                    names[0].tt = "INAME";
                    names[0].ignore = true;
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
                    meta.forEach(function (m) {
                        m.ignore = true;
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
            KEYWORD: mark,
            MAP: mark,
            NUMBER: mark,
            STRING: mark,
            VECTOR: mark,
            WHITESPACE: mark,
        }, ast);

        return ast;
    }

    function generate(ast) {
        const out = [];
        const cfg = {
            ROOT: function (node) {
                out.push("var ROOT_SCOPE = (function ($s) {\n\n")
                const d = node.d.slice();
                d.push({ tt: "X_ADORN", v: ";\nreturn $s\n}($Object_create(null)));\n" });
                return d;
            },
            MODULE: function (node) {
                // console.log("MODULE", node);
                const d = node.d.slice();
                // TODO: We need to handle weird module names!
                const name = node.name || "";
                if (name) {
                    out.push("$s['" + name + "'] = ");
                    out.push("function ($s) {\nvar $e = $Object_create(null);\n");
                } else {
                    out.push("(function ($s) {\nvar $r;\n");
                }
                (node.imports || []).forEach(function (mod) {
                    out.push("$import($s");
                    const all = mod.d || [];
                    let i = 0;
                    let ident = null;
                    while (ident = all[i]) {
                        let next = null;
                        let newName = null;
                        let renaming = false;
                        let j = i + 1;
                        while (next = all[j]) {
                            if (next.ignore || next.tt === "WHITESPACE") {
                                j += 1;
                                continue;
                            }
                            if (next.tt === "KEYWORD" && next.v === ":as") {
                                j += 1;
                                renaming = true;
                                continue;
                            }
                            if (renaming && next.tt === "IDENT") {
                                newName = next.v;
                            }
                            renaming = false;
                            j += 1;
                            break;
                        }
                        if (ident.ignore || ident.tt !== "IDENT") {
                            i += 1;
                            continue;
                        }
                        if (newName) {
                            out.push(",['" + ident.v + "','" + newName + "']");
                            i = j;
                        } else {
                            out.push(",['" + ident.v + "']");
                            i += 1;
                        }
                    }
                    out.push(");\n");
                });

                if (name) {
                    const exports = [];
                    (node.exports || []).forEach(function (mod) {
                        mod.d && mod.d.forEach(function (ident) {
                            if (ident.ignore || ident.tt !== "IDENT") {
                                return;
                            }
                            exports.push(";$e['" + ident.v + "'] = $s['" + ident.v + "']\n");
                        });
                    });
                    d.push({ tt: "X_ADORN", v: exports.join("") + "return $e\n};\n\n" });
                } else {
                    d.push({ tt: "X_ADORN", v: "\nreturn $r\n}($Object_create($s)));\n\n" });
                }
                return d;
            },
            IMPORT: function (node) {
                return [];
            },
            EXPORT: function (node) {
                return [];
            },
            FN: function (node) {
                // console.log("FN", node);
                const d = node.d.slice();
                // TODO: We need to handle weird module names!
                const name = node.name || "";
                const args = node.args && node.args.d && node.args.d || [];
                if (name) {
                    out.push(";$s['" + name + "'] = ");
                }
                out.push("function ($s) {\nvar $r;\n");
                for (let i = 0; i < args.length; i += 1) {
                    let arg = args[i];
                    out.push("$s['" + arg.v + "'] = arguments[" + (i + 1) + "];\n");
                }
                d.push({ tt: "X_ADORN", v: ";return $r\n}\n" });
                return d;
            },
            LET: function (node) {
                let i = 0;
                let stack = [];
                let native = false;
                while (i < node.d.length) {
                    // console.log("LET...", node.d[i]);
                    let n = node.d[i];
                    if (n.tt === "KEYWORD" && n.v === ":native") {
                        native = true;
                        i += 1;
                        continue;
                    }
                    if (n.ignore || n.tt === "WHITESPACE") {
                        i += 1;
                        continue;
                    }
                    stack.push(n);
                    if (stack.length % 2 === 0) {
                        const key = stack[stack.length - 2].v;
                        const subtree = stack[stack.length - 1];
                        out.push(";$r = $s['" + key + "'] = ");
                        if (native) {
                            out.push(subtree.v.trim());
                        } else {
                            // console.log(key, '=>', subtree);
                            traverse(cfg, subtree, "tt");
                        }
                        out.push(";\n");
                        native = false;
                    }
                    i += 1;
                }
                return [];
            },
            CALL: function (node) {
                const name = node.name;
                const len = node.d.length;
                out.push("$r = $s['" + name + "']($Object_create($s)");
                node.d.forEach(function (child, i) {
                    if (child.ignore || child.tt === "WHITESPACE") {
                        return;
                    }
                    out.push(",");
                    traverse(cfg, child, "tt");
                })
                out.push(")");
                return [];
            },
            ARGS: function (node) {
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
            MAP: function (node) {
                let i = 0;
                let stack = [];
                out.push("($r = {\n");
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
                        out.push('"' + key + '": ');
                        const subtree = stack[stack.length - 1];
                        // console.log(key, '=>', subtree);
                        traverse(cfg, subtree, "tt");
                        out.push(",\n");
                    }
                    i += 1;
                }
                out.push("})\n");
                return [];
            },
            KEYWORD: function (node) {
                if (node.ignore) {
                    return;
                }
                out.push('"' + node.v + '"');
            },
            // COMMENT: emitValue,
            IDENT: function (node) {
                // console.log("IDENT", node);
                out.push("($r = $s['" + node.v + "'])");
            },
            VECTOR: function (node) {
                const len = node.d.length;
                out.push("($r = [");
                node.d.forEach(function (child, i) {
                    if (child.ignore || child.tt === "WHITESPACE") {
                        return;
                    }
                    traverse(cfg, child, "tt");
                    if (i < len - 1) {
                        out.push(",");
                    }
                })
                out.push("])");
                return [];
            },
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

