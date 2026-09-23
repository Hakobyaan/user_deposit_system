import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { Client } from 'pg';

interface WorkerInput {
  reportId: string;
  userId: number;
  reportsDir: string;
  pg: { host: string; port: number; user: string; password: string; database: string };
}

async function run() {
  const { reportId, userId, reportsDir, pg } = workerData as WorkerInput;

  const client = new Client(pg);
  await client.connect();
  const { rows } = await client.query<{ count: string; total: string }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM transactions
      WHERE user_id = $1 AND type = 'deposit'`,
    [userId]
  );
  await client.end();

  // Simulated CPU-intensive analytics step — this is exactly why this
  // work happens off the main thread: a synchronous busy-loop here would
  // otherwise freeze every other request the Wallet Service is serving.
  let acc = 0;
  for (let i = 0; i < 2_000_000_00; i += 1) {
    acc += Math.sqrt(i % 97);
  }

  fs.mkdirSync(reportsDir, {
    recursive: true
  });
  const filePath = path.join(reportsDir, `${reportId}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('Wallet Deposit Report', {
      align: 'center'
    });
    doc.moveDown();
    doc.fontSize(12).text(`User ID: ${userId}`);
    doc.text(`Generated at: ${new Date().toISOString()}`);
    doc.moveDown();
    doc.text(`Total deposits: ${rows[0]?.count ?? 0}`);
    doc.text(`Total deposited amount: ${rows[0]?.total ?? '0.00'}`);
    doc.moveDown();
    doc.text(`(checksum of simulated analytics workload: ${acc.toFixed(2)})`);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  parentPort?.postMessage({
    status: 'done', path: filePath
  });
}

run().catch((err) => {
  parentPort?.postMessage({
    status: 'error', message: (err as Error).message
  });
});
