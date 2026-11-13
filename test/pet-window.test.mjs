import test from 'node:test';
import assert from 'node:assert/strict';
import {PetWindowDrag,petDimensions,fitPet} from '../src/core/pet-window.mjs';

function fixture({petSize=176,drift=false}={}) {
  let bounds={x:300,y:300,...petDimensions(petSize)},cursor={x:350,y:350};
  const calls=[];
  const primary={scaleFactor:1.25,workArea:{x:0,y:0,width:1536,height:864}};
  const left={scaleFactor:1.5,workArea:{x:-1280,y:-160,width:1280,height:1000}};
  const window={isDestroyed:()=>false,getBounds:()=>({...bounds}),setBounds:b=>{calls.push({...b});bounds={...b};if(drift){bounds.width++;bounds.height++;}},setPosition:()=>{throw new Error('setPosition must never be used for pet movement');}};
  const screen={getCursorScreenPoint:()=>({...cursor}),getDisplayNearestPoint:p=>p.x<0?left:primary,getDisplayMatching:()=>primary,getPrimaryDisplay:()=>primary};
  const drag=new PetWindowDrag(window,screen,()=>petSize);
  return {drag,calls,window,point:p=>{cursor=p;},bounds:()=>({...bounds}),setSize:s=>{petSize=s;}};
}

test('repeated movement never feeds rounded dimensions into the next move',()=>{
  const f=fixture({drift:true});f.drag.begin();
  for(let i=1;i<=1000;i++){f.point({x:350+i%300,y:350+i%100});f.drag.update();}
  assert.ok(f.calls.length>900);
  for(const b of f.calls)assert.deepEqual({width:b.width,height:b.height},{width:204,height:228});
});
test('positions derive from the original cursor anchor rather than accumulating',()=>{
  const f=fixture();f.drag.begin();f.point({x:360,y:360});f.drag.update();assert.deepEqual(f.bounds(),{x:310,y:310,width:204,height:228});f.point({x:370,y:380});f.drag.update();assert.deepEqual(f.bounds(),{x:320,y:330,width:204,height:228});
});
test('mixed scale monitors with negative origins preserve the configured DIP size',()=>{
  const f=fixture();f.drag.begin();
  for(const p of [{x:-100,y:100},{x:-1200,y:-80},{x:200,y:400},{x:1500,y:800}]){f.point(p);f.drag.update();assert.equal(f.bounds().width,204);assert.equal(f.bounds().height,228);}
  assert.equal(f.calls[0].x,-204); // Clamp the whole pet to the left monitor.
  assert.deepEqual(f.bounds(),{x:1332,y:636,width:204,height:228});
});
test('tiny click jitter does not move the window',()=>{
  const f=fixture();f.drag.begin();f.point({x:352,y:351});assert.deepEqual(f.drag.end(),{moved:false});assert.equal(f.calls.length,0);
});
test('returning to the initial point is still a drag, and release samples the final point',()=>{
  const f=fixture();f.drag.begin();f.point({x:380,y:350});f.drag.update();f.point({x:350,y:350});assert.deepEqual(f.drag.end(),{moved:true});assert.equal(f.bounds().x,300);
  f.drag.begin();f.point({x:400,y:400});assert.deepEqual(f.drag.end(),{moved:true});assert.equal(f.bounds().x,350);
});
test('cancellation discards queued movement',()=>{
  const f=fixture();f.drag.begin();f.drag.cancel();f.point({x:800,y:700});assert.deepEqual(f.drag.update(),{moved:false});assert.equal(f.calls.length,0);
});
test('restore replaces an inflated size and fits the configured pet inside the display',()=>{
  const f=fixture();f.window.setBounds({x:9000,y:9000,width:7000,height:7000});f.drag.restore(true);assert.deepEqual(f.bounds(),{x:1308,y:612,width:204,height:228});f.setSize(240);f.drag.restore();assert.equal(f.bounds().width,268);assert.equal(f.bounds().height,292);
  assert.deepEqual(fitPet({x:-9999,y:9999},{width:204,height:228},{x:-1280,y:-160,width:1280,height:1000}),{x:-1280,y:612,width:204,height:228});
});
