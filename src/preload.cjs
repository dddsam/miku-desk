const {contextBridge,ipcRenderer}=require('electron');
const methods=['bootstrap','saveConfig','chooseFolder','chat','stop','reject','clearHistory','togglePanel','hidePanel','minimizePanel','quit','menu','beginPetDrag','updatePetDrag','endPetDrag','cancelPetDrag','petEnded','activity','preview','discover','testProvider','listModels','exportConfig','importConfig'];
const api=Object.fromEntries(methods.map(name=>[name,(...args)=>ipcRenderer.invoke('miku:'+name,...args)]));
api.onEvent=callback=>{const handler=(_event,payload)=>callback(payload);ipcRenderer.on('miku:event',handler);return()=>ipcRenderer.removeListener('miku:event',handler);};
contextBridge.exposeInMainWorld('miku',api);
