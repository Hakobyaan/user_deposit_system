// The reports module has no Sequelize model / DB table of its own. Report
// status lives in Redis (see repository.ts) because Worker Threads report
// back via postMessage, not a shared in-memory object, and the PDF's
// content is built from a raw SQL query inside worker.ts — a worker thread
// can't reuse the main thread's Sequelize connection pool, so it opens its
// own plain `pg.Client` instead of importing a Sequelize model here. This
// file exists only so this module's data shape is still documented from a
// model.ts, same as every other module.
export {};
