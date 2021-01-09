default: test lint

lint: eslint prettier-lint

eslint:
	@node_modules/.bin/eslint . run

prettier-lint:
	@if ! node_modules/.bin/prettier --list-different . ; then \
		echo 'The above files do not follow standard formatting. Run  make prettier  to format your code.'; \
		exit 1; \
	fi

prettier:
	@node_modules/.bin/prettier . --write

test:
	@npm run test --silent

doc: src/* *.ts tsconfig.json
	@node_modules/.bin/tsc && node_modules/.bin/api-extractor run --local --verbose && node_modules/.bin/api-documenter markdown -i temp -o new-docs

lockserver-dev:
	node_modules/.bin/nodemon lockserver/lockserver.js

clean:
	@npm run clean

.PHONY: default lint test lockserver-dev clean eslint prettier-lint prettier doc
