function formatData(data) {
  if (!data || Object.keys(data).length === 0) return '';
  try {
    return ' ' + JSON.stringify(data);
  } catch {
    return '';
  }
}

export function logLive(category, message, data = null, level = 'info') {
  const time = new Date().toLocaleTimeString('he-IL');
  const line = `[${time}] [${category}] ${message}${formatData(data)}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function requestLogMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/css') || req.path.startsWith('/js')) return;
    const ms = Date.now() - start;
    logLive('שרת', `${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
}
