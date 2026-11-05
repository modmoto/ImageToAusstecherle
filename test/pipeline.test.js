import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import Module from 'manifold-3d';
import { extractContour } from '../src/contour.js';
import { createCutter, defaults } from '../src/geometry.js';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const api=await Module();api.setup();
for(const name of ['herz','stern','quadrat','schlange'])test(`${name}: real PNG → connected closed mesh → binary STL`,()=>{
  const png=PNG.sync.read(readFileSync(new URL(`../public/examples/${name}.png`,import.meta.url)));
  const {points}=extractContour(png);
  const result=createCutter(api,points,defaults);
  assert.ok(result.volume>0);
  assert.ok(Math.abs(result.bounds.max[2]-20)<0.001);
  // Every edge has exactly two opposing directed uses.
  const edges=new Map();
  const idx=result.indices;
  for(let i=0;i<idx.length;i+=3)for(let j=0;j<3;j++){
    const a=idx[i+j],b=idx[i+(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
    const entry=edges.get(key)||{count:0,balance:0};entry.count++;entry.balance+=a<b?1:-1;edges.set(key,entry);
  }
  for(const edge of edges.values()){assert.equal(edge.count,2);assert.equal(edge.balance,0);}
  const body=new api.Manifold(new api.Mesh({numProp:3,vertProperties:result.positions,triVerts:idx}));
  assert.equal(body.status(),'NoError');
  assert.equal(body.genus(),1,'single through opening');
  const pieces=body.decompose();assert.equal(pieces.length,1);pieces.forEach(p=>p.delete());body.delete();
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(result.positions,3));geo.setIndex(new THREE.BufferAttribute(idx,1));
  const binary=new STLExporter().parse(new THREE.Mesh(geo),{binary:true});
  assert.equal(binary.byteLength,84+result.triangles*50);
  const restored=new STLLoader().parse(binary.buffer);restored.computeBoundingBox();
  assert.ok(Math.abs(restored.boundingBox.max.z-20)<0.001);assert.ok(restored.attributes.position.count>0);
  console.log(`${name}: ${points.length} contour vertices, ${result.triangles} triangles, ${(binary.byteLength/1024).toFixed(0)} KB STL`);
  geo.dispose();restored.dispose();
});
test('empty image and invalid parameters fail clearly',()=>{
  assert.throws(()=>extractContour({width:8,height:8,data:new Uint8Array(8*8*4)}),/Keine Form/);
  assert.throws(()=>createCutter(api,[[0,0],[10,0],[10,10],[0,10]],{...defaults,tip:2}),/Schneidkante/);
  assert.throws(()=>createCutter(api,[[0,0],[10,0],[10,10],[0,10]],{...defaults,taper:15}),/Verjüngung/);
});
test('parameter changes affect dimensions and wall sections',()=>{
  const points=[[0,0],[100,0],[100,100],[0,100]];
  const p={...defaults,size:100,base:3,margin:7,height:18,wall:2,tip:0.6,taper:12};
  const r=createCutter(api,points,p);
  assert.ok(Math.abs(r.bounds.max[0]-r.bounds.min[0]-116)<0.01);
  assert.ok(Math.abs(r.bounds.max[2]-21)<0.001);
  const body=new api.Manifold(new api.Mesh({numProp:3,vertProperties:r.positions,triVerts:r.indices}));
  const mid=body.slice(3+6),tip=body.slice(21-0.001);
  assert.ok(mid.area()>tip.area()*2);
  assert.equal(body.genus(),1);mid.delete();tip.delete();body.delete();
});
