const clients = new Map();

export function addClient(id, res) {
  clients.set(id, res);
}

export function removeClient(id) {
  clients.delete(id);
}

export function sendToClient(id, event, data) {
  const client = clients.get(id);
  if (!client) return false;

  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(data)}\n\n`);
  return true;
}

export function broadcast(event, data) {
  for (const [id] of clients) {
    sendToClient(id, event, data);
  }
}

export function setupSse(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}
