(function (window, factory) {
    "use strict";

    window.Compiler = factory();

}(this, function () {

    const EOF = { eof: true };
    const slice = [].slice;

    /** @param {...any} anything */
    function trace(/* anything */) {
        // @ts-ignore
        console.log.apply(console, arguments);
    }

    /** @param {string} src */
    function tokenize(src) {
        const len = src.length;
        let i = 0;
        let srcCol = 1;
        let srcRow = 1;

        function next() {
            if (i >= len) {
                return {
                    value: null,
                    done: true,
                };
            }

            const parts = [];
            const col = srcCol;
            const row = srcRow;

            let tag = "symbol";
            let consumed = false;
            let lookahead = null;

            while (!consumed) {
                consumed = true;

                const c = src[i];
                const n = i < len ? src[i + 1] : EOF;
                const nextIsWhitespace = n === " " || n === "\t" || n === "\n";
                const isBeginningOfWord = parts.length === 0;

                switch (c) {
                    case "\n":
                        parts.push(c);
                        i += 1;
                        srcRow += 1;
                        srcCol = 1;
                        tag = "newline";
                        break;
                    case " ":
                        parts.push(c);
                        i += 1;
                        srcCol += 1;
                        tag = "whitespace";
                        consumed = !nextIsWhitespace;
                        break;
                    case "\t":
                        parts.push(c);
                        i += 1;
                        srcCol += 1;
                        tag = "whitespace";
                        consumed = !nextIsWhitespace;
                        break;
                    case ",": // Intentional fallthrough
                    case "\"": // Intentional fallthrough
                    case "{": // Intentional fallthrough
                    case "}": // Intentional fallthrough
                    case "[": // Intentional fallthrough
                    case "]": // Intentional fallthrough
                    case "(": // Intentional fallthrough
                    case ")": // Here we go
                        tag = c;
                        parts.push(c);
                        i += 1;
                        srcCol += 1;
                        break;
                    default:
                        if (isBeginningOfWord) {
                            switch (c) {
                                case ";":
                                    tag = c;
                                    break;
                                case ":":
                                    tag = "keyword";
                                    break;
                                case "'":
                                    tag = "'";
                                    break;
                            }
                        }
                        parts.push(c);
                        i += 1;
                        consumed = nextIsWhitespace || n === "(" || n === ")" || n === "[" || n === "]" || n === "{" || n === "}" || n === "," || n === "\"";
                        break;
                }

                if (consumed) {
                    lookahead = n;
                }
            }

            return {
                value: {
                    token: parts.join(""),
                    col: col,
                    row: row,
                    tag: tag,
                    lookahead: lookahead,
                },
                done: i > len,
            };
        }

        return {
            next: next,
        };
    }

    const defaultBuilders = {
        "newline": function (current, scope) {
            scope.push({
                type: "whitespace",
                text: current.value.token,
                tks: [current.value],
            });
        },
        ";": function (current, scope, stream) {
            const tks = [current.value];
            while (current = stream.next(), !current.done && current.value.tag !== "newline") {
                tks.push(current.value);
            }
            if (current.value.tag === "newline") {
                tks.push(current.value);
            }
            scope.push({
                type: "comment",
                text: tks.map(function (val) { return val.token; }).join(""),
                tks: tks,
            });
        },
        "whitespace": function (current, scope) {
            scope.push({
                type: "whitespace",
                text: current.value.token,
                tks: [current.value],
            });
        },
        "symbol": function (current, scope) {
            scope.push({
                type: "symbol",
                text: current.value.token,
                tks: [current.value],
            });
        },
        "(": function (current, scope, stream, path) {
            const tks = [current.value];
            const args = [];

            scope.push({
                type: "call",
                args: args,
                lookback: scope.length > 0 ? scope[scope.length - 1] : null,
                tks: tks,
            });

            path.push(scope);
            return args;
        },
        ")": function (current, scope, _, path) {
            const tks = [current.value];
            return path.pop();
        },
        "[": function (current, scope, _, path) {
            const tks = [current.value];
            const args = [];

            scope.push({
                type: "vector",
                args: args,
                tks: tks,
            });

            path.push(scope);
            return args;
        },
        "]": function (current, scope, _, path) {
            const tks = [current.value];
            return path.pop();
        },
        "{": function (current, scope, stream, path) {
            const tks = [current.value];
            const items = [];

            scope.push({
                type: "map",
                items: items,
                tks: tks,
            });

            path.push(scope);

            return items;
        },
        "}": function (current, scope, _, path) {
            const tks = [current.value];
            return path.pop();
        },
        "keyword": function (current, scope, stream, path) {
            scope.push({
                type: "keyword",
                text: current.value.token,
                tks: [current.value],
            });
        },
        ",": function (current, scope, stream, path) {
            scope.push({
                type: "comma",
                text: current.value.token,
                tks: [current.value],
            });
        },
        "'": function (current, scope, stream, path) {
            scope.push({
                type: "quote",
                lookahead: current.value.lookahead,
                text: current.value.token,
                tks: [current.value],
            });
        },
        "\"": function (current, scope, stream, path) {
            const tks = [current.value];
            const args = [];

            const node = {
                type: "string",
                text: "",
                tks: tks,
            };
            scope.push(node);

            while (current = stream.next(), !current.done) {
                if (current.value.tag === "\"") {
                    break;
                }
                tks.push(current.value);
                args.push(current.value)
            }

            node.text = args.map(function (val) { return val.token; }).join("");
        },
    };

    /** @param {string} src */
    /** @param {any?} builders */
    function parse(src, builders) {
        const stream = tokenize(src);
        const ast = { root: [] };
        let scope = ast.root;
        const path = [];
        let current = null;
        builders = builders || defaultBuilders;

        while (current = stream.next(), !current.done) {
            if (!(current.value.tag in builders)) {
                console.log("unsupported", current.value);
                break;
            }
            scope = builders[current.value.tag](current, scope, stream, path) || scope;
        }

        return ast;
    }

    function compile(ast) {
        console.log(ast);
    }

    return {
        eval: function (src) {
            return compile(parse(src));
        },
        parse: parse,
        compile: compile,
    };
}));