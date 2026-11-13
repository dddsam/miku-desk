import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=['miku_standby.mp4','miku_work_happy.mp4','miku_work_angry.mp4','miku_not_understand.mp4','miku_finishwork.mp4','icon.png'];
const missing=[];
for(const name of required){
  try{const stat=await fs.stat(path.join(root,'assets',name));if(!stat.isFile()||!stat.size)missing.push(name);}
  catch(error){if(error.code==='ENOENT')missing.push(name);else throw error;}
}
if(missing.length){
  console.error('缺少桌宠素材 / Missing pet media:');
  for(const name of missing)console.error('  assets/'+name);
  console.error('请按照 assets/README.md 添加素材后重新运行。');
  process.exitCode=1;
}else console.log('桌宠素材齐全 / All pet media files are present.');
