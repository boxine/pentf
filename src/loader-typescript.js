const ts = require('typescript');
const path = require('path');
const {fileURLToPath} = require('url');
const sourceMapSupport = require('source-map-support');
// Enable source-maps
sourceMapSupport.install({
    environment: 'node',
    retrieveFile: (pathOrUrl) => {
        if (pathOrUrl.startsWith('file://')) {
            pathOrUrl = fileURLToPath(pathOrUrl);
        }
        return cache.files.get(pathOrUrl);
    }
});

// TODO: Remove globals
const cache = {
    files: new Map(),
};

/** @ŧype {import('typescript').FormatDiagnosticsHost} */
let diagnosticHost;

const EXTENSIONS = ['.tsx', '.ts'];

/**
 * @returns {import('typescript').CompilerOptions}
 */
function getOptions() {
    const cwd = process.cwd(); // FIXME
    let basePath = cwd;

    let config = {};
    const configFileName = ts.findConfigFile(cwd, ts.sys.fileExists);
    if (configFileName) {
        const result = ts.readConfigFile(configFileName, ts.sys.readFile);

        // Return diagnostics.
        if (result.error) {
            throw new TSError(result.error);
        }

        config = result.config;
        basePath = path.dirname(configFileName);
    }

    config.compilerOptions.target = "ES2018";
    // Set some required default options
    config.compilerOptions.allowJs = true;
    config.compilerOptions.alwaysStrict = true;
    config.compilerOptions.sourceMap = true;
    config.compilerOptions.inlineSources = true;
    config.compilerOptions.inlineSourceMap = true;
    config.compilerOptions.noEmit = false;
    config.compilerOptions.declaration = false;
    config.compilerOptions.emitDeclarationOnly = false;
    //
    delete config.files;
    delete config.include;


    const outConfig = ts.parseJsonConfigFileContent(
        config,
        {
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
            readDirectory: ts.sys.readDirectory,
            useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        },
        basePath,
        undefined,
        configFileName
    );

    return outConfig;
}

/**
 * @param {import('typescript').ParsedCommandLine} options
 */
function createService(config) {
    const cwd = process.cwd(); // FIXME

    /** @type {import('typescript').LanguageServiceHost} */
    const host = {
        getCurrentDirectory: () => cwd,
        getScriptFileNames: () => Array.from(cache.files.keys()),
        getCompilationSettings: () => config.options,
        getDefaultLibFileName: () => ts.getDefaultLibFilePath(config.options),
        getScriptSnapshot: file => {
            let content = cache.files.get(file);
            if (content === undefined) {
                content = ts.sys.readFile(file);
                if (content === undefined) return;
            }
            return ts.ScriptSnapshot.fromString(content);
        },
        // TS uses the returned number as an indicator to reparse and type-check
        // a file again. It should only be incremented when the file changed.
        // Note that we don't support watch mode yet, so it is irrelevant for us
        // for now, but TS requires us to define this function.
        getScriptVersion: () => 1,

        // Without defining these TS can't find files in node_modules.
        // Not sure why.
        readDirectory: ts.sys.readDirectory,
        readFile: ts.sys.readFile,
        getDirectories: ts.sys.getDirectories,
        directoryExists: ts.sys.directoryExists,
        fileExists: ts.sys.fileExists
    };

    const registry = ts.createDocumentRegistry(ts.sys.useCaseSensitiveFileNames, cwd);
    ts.createIncrementalCompilerHost()
    const service = ts.createLanguageService(host, registry);
    return service;
}

/**
 * @type {typeof import('typescript').formatDiagnostics}
 */
let formatter;

class TSError extends Error {
    constructor(message) {
        super(`Unable to compile TypeScript:\n\n${message}`);
        this.name = 'TSError';
    }
}

/**
 * @param {Array<import('typescript').Diagnostic | import('typescript').DiagnosticWithLocation>} diagnostics
 */
function reportTSError(diagnostics) {
    const cwd = process.cwd(); // FIXME
    if (!formatter) {
        formatter = process.stdout.isTTY
            ? ts.formatDiagnosticsWithColorAndContext
            : ts.formatDiagnostics;
    }

    if (!diagnosticHost) {
        diagnosticHost = {
            getNewLine: () => ts.sys.newLine,
            getCurrentDirectory: () => cwd,
            getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? x => x : x => x.toLowerCase(),
        };
    }

    const text = formatter(diagnostics, diagnosticHost);
    throw new TSError(text);
}

/**
 * @param {import('typescript').LanguageService} service
 * @param {import('typescript').LanguageService} content
 * @param {import('typescript').LanguageService} fileName
 * @returns {Promise<import('typescript').EmitOutput>}
 */
function compile(service, content, fileName) {
    if (fileName.endsWith('.d.ts')) {
        throw new Error(`Invalid import: Trying to import a .d.ts file as a module "${fileName}"`);
    }

    cache.files.set(fileName, content);
    const output = service.getEmitOutput(fileName);
    output.outputFiles.forEach(f => {
        cache.files.set(f.name, f.text);
    });

    const diagnostics = service
        .getSemanticDiagnostics(fileName)
        .concat(service.getSyntacticDiagnostics(fileName));

    if (diagnostics.length > 0) {
        reportTSError(diagnostics);
        return;
    }

    return output;
}

/**
 * @param {import('typescript').LanguageService} service
 */
function registerCjsRequire(service) {
    EXTENSIONS.forEach(ext => {
        const oldHandler = require.extensions[ext] || require.extensions['.js'];
        /**
         * Per Node's docs `require.extensions` is deprecated, but there is no
         * replacement for it avilable. So in practice every module adapter
         * (ts-node, ts-jest,...) depends on it.
         * @type {(m: any, filename: string) => any}
         */
        require.extensions[ext] = (m, filename) => {
            const _compile = m._compile;
            m._compile = function (code, filename) {
                if (!cache.files.has(filename)) {
                    compile(service, code, filename);
                }

                const outFile = filename.substring(0, filename.lastIndexOf('.')) + '.js';
                const transpiledCode = cache.files.get(outFile);
                _compile.call(this, transpiledCode, outFile);
            };

            return oldHandler(m, filename);
        };
    });
}

module.exports = {
    getOptions,
    compile,
    createService,
    registerCjsRequire,
};
