/**
 * Tiny TCP server that records the FIRST message a MongoDB driver sends (its connection handshake)
 * and decodes the "client" metadata document from it. Lets tests verify exactly what a real MongoDB
 * server would receive, without needing one.
 */
const net = require('net');
const { BSON } = require('mongoose').mongo;

const OP_QUERY = 2004; // legacy handshake used by drivers for the first "isMaster"
const OP_MSG = 2013;

function decodeClientMetadata(buf) {
  const opCode = buf.readInt32LE(12);
  let offset = 16; // skip the message header
  if (opCode === OP_MSG) {
    offset += 4 + 1; // flagBits + section kind
  } else if (opCode === OP_QUERY) {
    offset += 4; // flags
    while (buf[offset] !== 0) offset += 1; // namespace (C string)
    offset += 1 + 4 + 4; // terminator + numberToSkip + numberToReturn
  } else {
    throw new Error(`Unexpected wire protocol opCode ${opCode}`);
  }
  const doc = BSON.deserialize(buf.subarray(offset, offset + buf.readInt32LE(offset)));
  return doc.client;
}

/** @returns {Promise<{uri: string, clientMetadata: Promise<object>, close: () => Promise<void>}>} */
async function startHandshakeCapture() {
  let resolveMetadata;
  let rejectMetadata;
  const clientMetadata = new Promise((resolve, reject) => { resolveMetadata = resolve; rejectMetadata = reject; });
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.once('data', (buf) => {
      try { resolveMetadata(decodeClientMetadata(buf)); } catch (err) { rejectMetadata(err); }
      socket.destroy();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    uri: `mongodb://127.0.0.1:${server.address().port}/handshake_probe`,
    clientMetadata,
    close: () => new Promise((resolve) => {
      sockets.forEach((s) => s.destroy());
      server.close(() => resolve());
    }),
  };
}

module.exports = { startHandshakeCapture };
