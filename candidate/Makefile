.PHONY: dev logs seed test run clean

dev:
	docker compose up -d

logs:
	docker compose logs -f

seed:
	npm install
	psql "$${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/webhooks}" -f migrations/001_init.sql
	python3 ../generators/generate_fixture.py --scenario public --seed 20260519 --out fixtures/public/public_events.jsonl

test:
	npm run test:public

run:
	npm run worker

clean:
	docker compose down -v
