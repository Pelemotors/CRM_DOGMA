import os from 'os';

export function getLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(nets || {})) {
    for (const net of entries || []) {
      const family = net.family === 4 || net.family === 'IPv4';
      if (family && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}
