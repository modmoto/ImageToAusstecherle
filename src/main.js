import './style.css';
import { defaults } from './geometry.js';
import { createViewer } from './viewer.js';

const $ = id=>document.getElementById(id);
const definitions = [
  ['size','Konturgröße',15,300,1], ['height','Wandhöhe über Base',2,50,0.5],
  ['wall','Wandstärke',0.4,5,0.1], ['taper','Verjüngung ab Höhe',0,49,0.5],
  ['tip','Dicke der Schneidkante',0.2,5,0.1], ['base','Dicke der Base',1,15,0.5],
  ['margin','Randabstand der Base',0.5,20,0.5],
];
$('parameters').innerHTML = definitions.map(([key,label,min,max,step])=>`<div class="parameter"><label for="${key}">${label}</label><div class="number-wrap"><input id="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${defaults[key]}" required /><span>mm</span></div></div>`).join('');
const examples = [['herz','Herz','Ein Herz für Selbstgemachtes.'],['stern','Stern','Ein kleiner Stern zum Ausstechen.'],['quadrat','Quadrat','Ganz einfach. Schön quadratisch.'],['schlange','Schlange','Eine Form mit Schwung.']];
$('examples').innerHTML=examples.map(([key,name])=>`<button type="button" class="example" data-key="${key}" aria-pressed="false"><img src="${import.meta.env.BASE_URL}examples/${key}.png" alt="" />${name}</button>`).join('');
const worker = new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
let viewer;
try { viewer=createViewer($('viewer')); }
catch { setStatus('Die 3D-Vorschau benötigt WebGL. Bitte Hardwarebeschleunigung aktivieren oder einen anderen Browser verwenden.','error'); }
let image, sourceName='Herz', request=0, timer, valid=false, needsFit=true, loadId=0;
function setStatus(message,type='') { $('status').textContent=message;$('status').className=type; }
function invalidate() { valid=false;$('download').disabled=true;request++; }
function schedule() {
  invalidate();clearTimeout(timer);
  if(image){$('busy').hidden=false;timer=setTimeout(generate,220);}
}
function generate() {
  if(!image)return;
  const parameters=Object.fromEntries(definitions.map(([key])=>[key,$(key).valueAsNumber]));
  setStatus('Deine Kontur wird in eine Ausstechform umgewandelt …');
  worker.postMessage({id:request,image,parameters,threshold:Number($('threshold').value),invert:$('invert').checked});
}
worker.onmessage=({data})=>{
  if(data.id!==request)return;
  $('busy').hidden=true;
  if(data.error){setStatus(data.error,'error');return;}
  const r=data.result;
  viewer?.setModel(r,needsFit);needsFit=false;
  const fmt=n=>n.toLocaleString('de-DE',{maximumFractionDigits:1});
  $('bounds').textContent=`${fmt(r.bounds.max[0]-r.bounds.min[0])} × ${fmt(r.bounds.max[1]-r.bounds.min[1])} mm`;
  $('total-height').textContent=`${fmt(r.bounds.max[2]-r.bounds.min[2])} mm`;
  $('volume').textContent=`${fmt(r.volume/1000)} cm³`;
  setStatus(data.warnings.length?data.warnings.join(' '):`Geschlossener, zusammenhängender Körper · ${r.triangles.toLocaleString('de-DE')} Dreiecke`,data.warnings.length?'warning':'');
  valid=!!viewer;$('download').disabled=!valid;
};
worker.onerror=()=>{$('busy').hidden=true;invalidate();setStatus('Die Berechnung konnte nicht geladen werden. Bitte die Seite neu laden.','error');};
async function loadImage(source,name,exampleKey) {
  const token=++loadId;invalidate();clearTimeout(timer);$('busy').hidden=false;
  try {
    const bitmap = await createImageBitmap(await (typeof source==='string'?fetch(source).then(r=>{if(!r.ok)throw new Error('Beispiel konnte nicht geladen werden.');return r.blob();}):source));
    if(token!==loadId){bitmap.close();return;}
    if(bitmap.width>16000||bitmap.height>16000){bitmap.close();throw new Error('Das Bild ist zu groß. Bitte vorher auf höchstens 16.000 Pixel pro Seite verkleinern.');}
    const scale=Math.min(1,508/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(bitmap.width*scale)+4;canvas.height=Math.ceil(bitmap.height*scale)+4;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,2,2,canvas.width-4,canvas.height-4);
    image=ctx.getImageData(0,0,canvas.width,canvas.height);sourceName=name;
    $('source-name').textContent=name;$('source-description').textContent=`${bitmap.width} × ${bitmap.height} px · lokal geladen`;
    $('source-image').src=canvas.toDataURL('image/png');bitmap.close();
    document.querySelectorAll('.example').forEach(button=>{const active=button.dataset.key===exampleKey;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('preview-title').textContent=examples.find(e=>e[0]===exampleKey)?.[2]||'Dein Motiv. Deine Ausstechform.';
    needsFit=true;schedule();
  } catch(error) {
    if(token!==loadId)return;
    image=null;$('busy').hidden=true;setStatus(error.message||'Bild konnte nicht geöffnet werden.','error');
  }
}
function loadFile(file) {
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setStatus('Bitte eine PNG-, JPG- oder WebP-Datei auswählen.','error');return;}
  if(file.size>20*1024*1024){setStatus('Bitte ein Bild mit höchstens 20 MB auswählen.','error');return;}
  loadImage(file,file.name);
}
$('examples').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;$('threshold').value=128;$('threshold-value').textContent=128;$('invert').checked=false;const key=button.dataset.key;loadImage(`${import.meta.env.BASE_URL}examples/${key}.png`,examples.find(e=>e[0]===key)[1],key);});
$('file').addEventListener('change',()=>{loadFile($('file').files[0]);$('file').value='';});
$('parameters').addEventListener('input',schedule);
$('threshold').addEventListener('input',()=>{$('threshold-value').textContent=$('threshold').value;schedule();});
$('invert').addEventListener('change',schedule);
$('reset').addEventListener('click',()=>{for(const [key,value]of Object.entries(defaults))$(key).value=value;needsFit=true;schedule();});
$('view-reset').addEventListener('click',()=>viewer?.reset());
const drop=$('drop-zone');
for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging');});
for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragging');});
drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$('download').addEventListener('click',()=>{
  if(!valid||!viewer)return;
  const blob=new Blob([viewer.exportSTL()],{type:'model/stl'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=`ausstecherle-${sourceName.replace(/\.[^.]+$/,'').replace(/[^a-z0-9äöüß-]/gi,'-')}-${$('size').value}mm.stl`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setStatus('STL heruntergeladen. Im Slicer als Millimeter importieren; Druckeinstellungen und Vorschau prüfen.');
});
loadImage(`${import.meta.env.BASE_URL}examples/herz.png`,'Herz','herz');
