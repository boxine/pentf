default: test lint

lint:
	@npm run lint --silent

test:
	@npm run test --silent

doc: *.js tsconfig.json
	./node_modules/.bin/typedoc --out doc --noEmit --excludeNotExported --excludeNotDocumented --excludeExternals \
		browser_utils.js email.js net_utils.js promise_utils.js utils.js

lockserver-dev:
	node_modules/.bin/nodemon lockserver/lockserver.js

clean:
	@npm run clean

.PHONY: default lint test lockserver-dev clean

