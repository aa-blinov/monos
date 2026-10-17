// One Monos backend as a process of its own, for tests that need two devices (the backend keeps its notes folder
// in module state, so two devices cannot share a process). Prints `PORT <n>` when it listens.
const { startServer } = await import('../index.js');
const { port } = await startServer({ port: 0, host: '127.0.0.1' });
console.log(`PORT ${port}`);
