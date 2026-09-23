import fs from 'node:fs';
import { Router } from '../../types/module';
import { BadRequest, NotFound } from '../../utils/errors';
import service from './service';

export const module: Router = {
  path:   '/reports',
  routes: [
    {
      method:  'POST',
      path:    '/generate',
      handler: async (req, res) => {
        const userId = Number(req.body?.userId);
        if (!userId) throw new BadRequest('userId is required');

        const reportId = await service.generate(userId);
        res.status(202).json({
          ok: true, status: 202, data: {
            reportId
          }
        });
      },
    },
    {
      method:  'GET',
      path:    '/:reportId/status',
      handler: async ({ params }) => {
        const reportId = String(params.reportId);
        const record = await service.getStatus(reportId);
        if (!record) throw new NotFound('Unknown reportId');
        return {
          reportId, status: record.status, message: record.message
        };
      },
    },
    {
      method:  'GET',
      path:    '/:reportId/download',
      handler: async (req, res) => {
        const reportId = String(req.params.reportId);
        const record = await service.getStatus(reportId);
        if (!record) throw new NotFound('Unknown reportId');
        if (record.status !== 'done' || !record.path) {
          throw new BadRequest(`Report is not ready yet (status: ${record.status})`);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${reportId}.pdf"`);

        await new Promise<void>((resolve, reject) => {
          const stream = fs.createReadStream(record.path as string);
          stream.on('error', reject);
          res.once('finish', resolve);
          res.once('close', resolve);
          stream.pipe(res);
        });
      },
    },
  ],
};
