import { Router } from '../../types/module';
import { clearEvents, readEvents } from '../../utils/trace';
import { FAULT_INJECTION } from '../../utils/variables';

export const module: Router = {
  path:   '/events',
  routes: [
    {
      method:  'GET',
      path:    '/',
      handler: async ({ query }) => {
        const after = Number(query.after ?? 0) || 0;
        const traceId = typeof query.traceId === 'string' ? query.traceId : undefined;
        return {
          faultInjection: FAULT_INJECTION,
          events:         await readEvents(after, traceId),
        };
      },
    },
    {
      method:  'DELETE',
      path:    '/',
      handler: async () => {
        await clearEvents();
        return { cleared: true };
      },
    },
  ],
};
