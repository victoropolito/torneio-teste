import { app } from './app.js';
import { startCheckWorker } from './official/worker.js';

const port = Number(process.env.PORT ?? 3333);

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
  startCheckWorker();
});
