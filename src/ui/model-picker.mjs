export class ModelPicker {
  constructor({dialog,search,list,count,empty,onSelect}) {
    Object.assign(this,{dialog,search,list,count,empty,onSelect});this.models=[];this.selected='';
    search.addEventListener('input',()=>this.render());
    search.addEventListener('keydown',e=>{
      if(e.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();this.dialog.close();return;}
      if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}
      if(e.key==='Enter'){e.preventDefault();list.querySelector('button')?.click();}
    });
    list.addEventListener('keydown',e=>{
      const buttons=[...list.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);
      if(at<0)return;
      let next=at;
      if(e.key==='ArrowDown')next=Math.min(at+1,buttons.length-1);
      else if(e.key==='ArrowUp')next=Math.max(at-1,0);
      else if(e.key==='Home')next=0;
      else if(e.key==='End')next=buttons.length-1;
      else return;
      e.preventDefault();buttons[next]?.focus();
    });
  }
  setModels(models) {this.models=[...new Set(models.filter(x=>typeof x==='string' && x.trim()))];this.render();}
  open(models,selected='') {this.selected=selected;this.search.value='';this.setModels(models);if(!this.dialog.open)this.dialog.showModal();this.search.focus();}
  render() {
    const terms=this.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered=this.models.filter(m=>terms.every(t=>m.toLowerCase().includes(t)));
    const fragment=document.createDocumentFragment();
    for(const model of filtered){
      const b=document.createElement('button');b.type='button';b.className='model-option';b.textContent=model;b.title=model;
      if(model===this.selected){b.classList.add('selected');b.setAttribute('aria-current','true');}
      b.addEventListener('click',()=>{this.onSelect(model);this.dialog.close();});fragment.append(b);
    }
    this.list.replaceChildren(fragment);this.list.scrollTop=0;
    this.count.textContent=`${filtered.length} / ${this.models.length} 个模型`;
    this.empty.hidden=filtered.length>0;
    this.empty.textContent=this.models.length?'没有匹配项。换一个关键词，或关闭后手动填写完整模型 ID。':'还没有获取模型列表。点击下方「刷新列表」，或关闭后手动填写模型 ID。';
  }
}
