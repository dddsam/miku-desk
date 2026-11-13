const videos={standby:'miku_standby.mp4',happy:'miku_work_happy.mp4',angry:'miku_work_angry.mp4',confused:'miku_not_understand.mp4',finished:'miku_finishwork.mp4'};
const pet=document.getElementById('pet'),video=document.getElementById('video'),dot=document.getElementById('dot');
let current='',drag=null,frame=0;
function state(value){if(current===value)return;current=value;video.loop=value!=='finished';video.src='../../assets/'+videos[value];video.play().catch(()=>{});dot.className=['happy','angry'].includes(value)?'busy':value==='confused'?'confused':'';}
function appearance(config){document.getElementById('caption').textContent=config.name;document.documentElement.style.setProperty('--pet-size',Math.round(config.petSize)+'px');}
window.miku.bootstrap().then(x=>{appearance(x.config);state(x.state);});
window.miku.onEvent(e=>{if(e.type==='state')state(e.state);if(e.type==='config')appearance(e.config);});
video.addEventListener('ended',()=>{if(current==='finished')window.miku.petEnded();});
pet.addEventListener('contextmenu',e=>{e.preventDefault();window.miku.menu();});
// The main process owns geometry and samples the cursor in a single DIP space.
// Renderer events only signal the gesture; they never calculate window bounds.
function cancelDrag(){
  if(!drag)return;
  const id=drag.pointerId;drag=null;cancelAnimationFrame(frame);frame=0;
  if(pet.hasPointerCapture(id))pet.releasePointerCapture(id);
  window.miku.cancelPetDrag().catch(()=>{});
}
pet.addEventListener('pointerdown',e=>{
  if(e.button!==0 || drag)return;
  e.preventDefault();
  drag={pointerId:e.pointerId,inFlight:false};pet.setPointerCapture(e.pointerId);
  window.miku.beginPetDrag().catch(cancelDrag);
});
pet.addEventListener('pointermove',e=>{
  if(!drag || drag.pointerId!==e.pointerId || frame || drag.inFlight)return;
  const gesture=drag;
  frame=requestAnimationFrame(()=>{
    frame=0;if(drag!==gesture)return;
    gesture.inFlight=true;
    window.miku.updatePetDrag().catch(cancelDrag).finally(()=>{gesture.inFlight=false;});
  });
});
pet.addEventListener('pointerup',e=>{
  if(!drag || drag.pointerId!==e.pointerId || e.button!==0)return;
  drag=null;cancelAnimationFrame(frame);frame=0;
  if(pet.hasPointerCapture(e.pointerId))pet.releasePointerCapture(e.pointerId);
  window.miku.endPetDrag().then(result=>{if(!result.moved)window.miku.togglePanel();}).catch(()=>{});
});
pet.addEventListener('pointercancel',cancelDrag);
pet.addEventListener('lostpointercapture',cancelDrag);
pet.addEventListener('dragstart',e=>e.preventDefault());
