const http = require('http');
const { createHash } = require('crypto');
const Buffer = require('buffer').Buffer;


const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer();

server.on('upgrade', wsReqHandler);

function wsFrameGetMsg(ws_frame){
  //console.log("ws frame -->");
  //console.log(ws_frame);

  fin = ws_frame[0] & 0x80;
  // assert fin == 1

  opcode = ws_frame[0] & 0x0F;
  if (opcode != 0x01) {
    console.log("It is not text frame");
    return undefined;
  }

  mask = ws_frame[1] & 0x80;
  payload_len = ws_frame[1] & 0x7F;
  payload_offset = 2;
  
  mask_key = undefined
  if (mask != 0){
    mask_key = ws_frame.subarray(2, 6);
    payload_offset += 4;
    //console.log("mask key: ");
    //console.log(mask_key);
  }

  payload = ws_frame.subarray(payload_offset, ws_frame.length);

  // Apply mask 
  if (mask != 0) {
    for (var i = 0; i < payload.length; i++){
      payload[i] = payload[i] ^ mask_key[i%4]
    }
  }
  
  return payload
};


function wsFrameMake(payload){
  let offset = 2;
  let payloadLength = payload.length;

  console.log("[DEBUG] -0");

  if (payload.length >= 65536) {
    offset += 8;
    payloadLength = 127;
  } else if (payload.length > 125) {
    offset += 2;
    payloadLength = 126;
  }

  const header = Buffer.allocUnsafe(offset);

  //console.log("[DEBUG] -1");

  header[0] = 0x1 | 0x80; // FIN = 1, OPCODE is text

  header[1] = payloadLength;

  //console.log("[DEBUG] -2");

  if (payloadLength === 126) {
    header.writeUInt16BE(payload.length, 2);
  } else if (payloadLength === 127) {
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(payload.length, 6);
  }

  //console.log("[DEBUG] -3");
  //console.log(header);

  return [header, payload];
};


function wsReqHandler(req, socket, bodyHead) {
  
  const state = {
    onData: null,
    onEnd: null
  };

  state.onData = OnWsDataHandler.bind(undefined, socket);

  socket.on('data', state.onData);

  // Write the resonse to websocket client
  const key =
  req.headers['sec-websocket-key'] !== undefined
    ? req.headers['sec-websocket-key']
    : false;

    const digest = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');


  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${digest}`
  ];

  socket.write(headers.concat('\r\n').join('\r\n'));
};


// For data transmition of websocket
// How many byte is read then ondata is called.
function OnWsDataHandler(socket, d)
{
  // Step 1: obtain data
  console.log("[DEBUG] on data start");
  msg = wsFrameGetMsg(d);
  console.log(msg.toString());
  console.log("[DEBUG] on data end");

  if (msg == undefined) return;

  payload_echo = Buffer.from('Echo: ' + msg.toString())

  console.log(payload_echo.toString())

  // Step 2: send the echo response
  r = wsFrameMake(payload_echo.toString());

  socket.write(r[0]);
  socket.write(r[1]);
};

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
  console.trace();
});