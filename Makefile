default: test lint

lint:
	@npm run lint --silent

test:
	@npm run test --silent

doc: *.js tsconfig.json
	./node_modules/.bin/typedoc --out doc --noEmit --excludeNotExported --excludeNotDocumented

lockserver-dev:
	node_modules/.bin/nodemon lockserver/lockserver.js

clean:
	@npm run clean

.PHONY: default lint test lockserver-dev clean

