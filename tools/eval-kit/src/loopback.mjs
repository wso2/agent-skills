import net from 'node:net';

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number' && typeof args[1] !== 'string') args.splice(1, 0, '127.0.0.1');
  else if (args[0] && typeof args[0] === 'object' && !args[0].host && !args[0].path && !args[0].fd && !args[0].handle) args[0] = { ...args[0], host: '127.0.0.1' };
  return listen.apply(this, args);
};
