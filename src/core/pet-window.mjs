// All positions and sizes here are Electron device-independent pixels (DIP).
// Never feed renderer screenX/window.screenX or a previously rounded size back
// into the next move: repeated setPosition calls can accumulate size drift on
// Windows displays with fractional scaling.
export function petDimensions(petSize) {
  const size=Math.round(petSize);
  return {width:size+28,height:size+52};
}
export function fitPet(position, dimensions, workArea) {
  return {
    x:Math.round(Math.max(workArea.x,Math.min(position.x,workArea.x+workArea.width-dimensions.width))),
    y:Math.round(Math.max(workArea.y,Math.min(position.y,workArea.y+workArea.height-dimensions.height))),
    ...dimensions
  };
}
export class PetWindowDrag {
  constructor(window,screen,getPetSize) {this.window=window;this.screen=screen;this.getPetSize=getPetSize;this.gesture=null;}
  begin() {
    const origin=this.window.getBounds();
    this.gesture={origin:{x:origin.x,y:origin.y},cursor:this.screen.getCursorScreenPoint(),dimensions:petDimensions(this.getPetSize()),moved:false};
  }
  update() {
    const g=this.gesture;
    if(!g || this.window.isDestroyed())return {moved:false};
    const cursor=this.screen.getCursorScreenPoint();
    const dx=cursor.x-g.cursor.x,dy=cursor.y-g.cursor.y;
    if(Math.abs(dx)+Math.abs(dy)>5)g.moved=true;
    if(!g.moved)return {moved:false};
    const bounds=fitPet({x:g.origin.x+dx,y:g.origin.y+dy},g.dimensions,this.screen.getDisplayNearestPoint(cursor).workArea);
    const current=this.window.getBounds();
    if(['x','y','width','height'].some(k=>current[k]!==bounds[k]))this.window.setBounds(bounds,false);
    return {moved:true};
  }
  end() {const result=this.update();this.cancel();return result;}
  cancel() {this.gesture=null;}
  restore(resetPosition=false) {
    this.cancel();
    const current=this.window.getBounds(),dimensions=petDimensions(this.getPetSize());
    const area=(resetPosition?this.screen.getPrimaryDisplay():this.screen.getDisplayMatching(current)).workArea;
    const position=resetPosition?{x:area.x+area.width-dimensions.width-24,y:area.y+area.height-dimensions.height-24}:current;
    this.window.setBounds(fitPet(position,dimensions,area),false);
  }
}
