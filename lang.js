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

    function traverse(visitors, ast) {
        const stack = [ast];
        let node = null;
        let visit = null;
        let descendents = null;

        while (stack.length) {
            node = stack[0];
            stack.splice(0, 1);
            visit = visitors[node.t];
            descendents = node.d;
            if (visit) {
                descendents = visit(node) || node.d;
            }
            if (descendents) {
                stack.splice.apply(stack, [0, 0].concat(descendents));
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

    return {
        parse: parse,
        print: print,
        compile: function (code) {
            return print(parse(code));
        },
    };
}))

