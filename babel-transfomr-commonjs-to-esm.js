function isRequireCall(t, node) {
    return (
        t.isCallExpression(node) && t.isIdentifier(node.callee) && node.callee.name === 'require'
    );
}

function moveComments(node, target) {
    if (Array.isArray(node.leadingComments) && node.leadingComments.length > 0) {
        target.leadingComments = node.leadingComments;
        node.leadingComments = undefined;
    }
}

/**
 * This babel plugin doesn't aim to support every edge case for CommonJS
 * modules and instead only focuses on the subset we use in this repo.
 */
module.exports = function cjs2esm({types: t}) {
    return {
        visitor: {
            Program(path, state) {
                // If there is no top-level expression, then there is no
                // module.exports assignment
                const moduleExpIdx = path.node.body.findIndex(
                    node =>
                        t.isExpressionStatement(node) &&
                        t.isAssignmentExpression(node.expression) &&
                        node.expression.operator === '='
                );
                const moduleExp = path.node.body[moduleExpIdx];
                if (
                    !moduleExp ||
                    !t.isMemberExpression(moduleExp.expression.left) ||
                    !t.isObjectExpression(moduleExp.expression.right)
                ) {
                    return;
                }

                // Check if we're dealing with `module.exports`
                const member = moduleExp.expression.left;
                if (
                    !(
                        t.isIdentifier(member.object) &&
                        member.object.name === 'module' &&
                        t.isIdentifier(member.property) &&
                        member.property.name === 'exports'
                    )
                ) {
                    return;
                }

                // Collect a list of export name -> reference maps
                const fns = new Map();
                const requires = new Map();
                path.node.body.forEach((node, i) => {
                    if (t.isFunctionDeclaration(node)) {
                        fns.set(node.id.name, {i, node});
                    } else if (
                        t.isVariableDeclaration(node) &&
                        node.declarations.length === 1 &&
                        node.declarations[0].init !== null
                    ) {
                        const varDecl = node.declarations[0];
                        const specifiers = [];
                        let source;
                        // Scenarios:
                        // const a = require('./a');
                        // const { a, b } = require('./a');
                        if (isRequireCall(t, varDecl.init)) {
                            source = varDecl.init.arguments[0];
                            const left = varDecl.id;

                            if (t.isObjectPattern(left)) {
                                left.properties.forEach(prop => {
                                    // Scenarios:
                                    // import { foo } from 'bar';
                                    // import { foo as bob } from 'bar';
                                    if (t.isIdentifier(prop.key) && t.isIdentifier(prop.value)) {
                                        specifiers.push(t.importSpecifier(prop.key, prop.value));
                                        requires.set(prop.key.name, {i, node: varDecl});
                                    } else {
                                        throw new Error('Unsupported require statement');
                                    }
                                });
                            } else if (t.isIdentifier(left)) {
                                specifiers.push(t.importNamespaceSpecifier(left));
                                requires.set(left.name, {i, node: varDecl});
                            } else {
                                throw new Error('Unsupported node');
                            }
                        }
                        // Scenarios:
                        // const a = require('./a').foo;
                        else if (
                            t.isMemberExpression(varDecl.init) &&
                            isRequireCall(t, varDecl.init.object)
                        ) {
                            source = varDecl.init.object.arguments[0];
                            specifiers.push(t.importSpecifier(varDecl.id, varDecl.init.property));
                        }

                        if (source && specifiers.length > 0) {
                            if (
                                state.opts &&
                                state.opts.extension &&
                                source.value.startsWith('.')
                            ) {
                                source.value += state.opts.extension;
                            }

                            path.node.body[i] = t.importDeclaration(specifiers, source);
                        }
                    }
                });

                const newImports = [];
                const obj = moduleExp.expression.right;
                obj.properties.forEach(prop => {
                    if (!t.isIdentifier(prop.key) || !t.isIdentifier(prop.value)) {
                        throw new Error(
                            'Only references are supported right now in module.export statements'
                        );
                    }

                    if (prop.key.name === prop.value.name) {
                        const decl = fns.get(prop.key.name);
                        if (!decl) {
                            const reExport = requires.get(prop.key.name);
                            if (!reExport) {
                                throw new Error(
                                    `Function declaration for "${prop.key.name}" not found`
                                );
                            }

                            const source = reExport.node.init.arguments[0];

                            const exportNode = t.exportNamedDeclaration(null, [
                                t.exportSpecifier(prop.key, prop.key),
                            ]);
                            path.node.body[reExport.i] = exportNode;

                            const importNode = t.importDeclaration(
                                [t.importSpecifier(prop.key, prop.key)],
                                source
                            );
                            newImports.push(importNode);
                        } else {
                            const exportNode = t.exportNamedDeclaration(decl.node);
                            moveComments(decl.node, exportNode);
                            path.node.body[decl.i] = exportNode;
                        }
                    }
                });

                // Remove `module.exports` expression
                path.node.body.splice(moduleExpIdx, 1);

                // Add any new imports (mainly because of re-exports)
                newImports.forEach(importNode => {
                    path.node.body.unshift(importNode);
                });
            },

            Directive(path) {
                // ES Modules are always strict, therefore delete any
                // present "use strict"; directives
                if (path.node.value.value === 'use strict') {
                    path.remove();
                }
            },
        },
    };
};
