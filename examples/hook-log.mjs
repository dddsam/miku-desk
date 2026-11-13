// Register as a Hook: command=node, args=[absolute path to this file].
// Input is one JSON object on stdin; do not print secrets into logs.
import fs from 'node:fs/promises';
let input='';for await(const chunk of process.stdin)input+=chunk;
const event=JSON.parse(input);
await fs.appendFile('miku-events.jsonl',JSON.stringify({at:new Date().toISOString(),event:event.event,tool:event.name || null})+'\n');
console.log(JSON.stringify({ok:true}));
