// Explicit live synthetic test; never uploads a user's file, sends mail or AI.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const args=process.argv.slice(2);
const i=args.indexOf("--project-ref");
const ref=i>=0?args[i+1]:"";
const base=`https://${ref}.supabase.co`;
if (!args.includes("--apply") || !/^[a-z]{20}$/.test(ref) ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/,"")!==base) {
  throw new Error("Owner authorization, matching --project-ref and --apply required.");
}
const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const management=process.env.SUPABASE_ACCESS_TOKEN;
if(!key||!management) throw new Error("Operator credentials unavailable.");
const keys=await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`,{
  headers:{Authorization:`Bearer ${management}`},signal:AbortSignal.timeout(20000)});
if(!keys.ok) throw new Error(`Server credential lookup HTTP ${keys.status}`);
const server=(await keys.json()).find(k=>k.name==="service_role")?.api_key;
if(!server) throw new Error("Server credential unavailable.");
const admin={apikey:server,Authorization:`Bearer ${server}`,"Content-Type":"application/json"};
const ids=[],sessions=[],paths=[],checks=[];
let failure;
async function call(actor,path,{method="GET",body,prefer,expected}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{
    apikey:key,Authorization:`Bearer ${sessions[actor]}`,"Content-Type":"application/json",
    ...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  const data=text?JSON.parse(text):null;
  if(expected?!expected.includes(response.status):!response.ok){
    throw new Error(`Memory check ${method} ${path.split("?")[0]} HTTP ${response.status}, code ${data?.code??data?.statusCode??"unknown"}`);
  }
  return data;
}
const rest=(actor,path,options)=>call(actor,`/rest/v1/${path}`,options);
const change=(connection,status)=>rest(1,"rpc/set_aevum_partner_connection",{
  method:"POST",body:{p_connection_id:connection.id,p_status:status}});
const consent=(granted)=>rest(0,"aevum_consents?on_conflict=user_id,scope",{
  method:"POST",prefer:"resolution=merge-duplicates",body:{
    user_id:ids[0],scope:"partner_sharing",version:"aevum-entry-sharing-v1",granted,
    granted_at:granted?new Date().toISOString():null,revoked_at:granted?null:new Date().toISOString()}});
const share=(item,connection)=>rest(0,"rpc/share_relationship_media",{method:"POST",
  body:{p_item_id:item.id,p_connection_id:connection.id,p_expected_updated_at:item.updated_at}});
const sign=(actor,path,expected)=>call(actor,`/storage/v1/object/sign/relationship-memories/${path}`,
  {method:"POST",body:{expiresIn:300},expected});
try{
  for(let n=0;n<3;n++){
    const email=`kairos-memory-${randomUUID()}@example.invalid`;
    const password=randomBytes(36).toString("base64url");
    const created=await fetch(`${base}/auth/v1/admin/users`,{method:"POST",headers:admin,
      body:JSON.stringify({email,password,email_confirm:true,user_metadata:{purpose:"disposable-memory-verification"}}),
      signal:AbortSignal.timeout(20000)});
    if(!created.ok) throw new Error(`Disposable identity setup HTTP ${created.status}`);
    const user=await created.json(); if(!user.id) throw new Error("Disposable identity missing.");
    ids.push(user.id);
    const login=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:"POST",
      headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({email,password}),
      signal:AbortSignal.timeout(20000)});
    if(!login.ok) throw new Error(`Disposable sign-in HTTP ${login.status}`);
    const session=await login.json(); if(!session.access_token) throw new Error("Disposable session missing.");
    sessions.push(session.access_token);
  }
  const [conn]=await rest(0,"partner_connections",{method:"POST",prefer:"return=representation",
    body:{requester_id:ids[0],recipient_id:ids[1]}});
  await change(conn,"accepted");
  await consent(true);
  const [song]=await rest(0,"relationship_media_items",{method:"POST",prefer:"return=representation",
    body:{user_id:ids[0],kind:"song",provider:"spotify",title:"Synthetic song",
      note:"Synthetic note",external_url:"https://open.spotify.com/track/synthetic"}});
  assert.deepEqual(await rest(1,`relationship_media_items?id=eq.${song.id}`),[]);
  const songShare=await share(song,conn);
  assert.equal((await rest(1,`relationship_media_shares?id=eq.${songShare.id}`))[0].note,"Synthetic note");
  assert.deepEqual(await rest(2,`relationship_media_shares?id=eq.${songShare.id}`),[]);
  checks.push("private song link saved; only reviewed recipient could read its snapshot");

  const path=`${ids[0]}/${randomUUID()}.png`; paths.push(path);
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLxQAAAAASUVORK5CYII=","base64");
  const upload=await fetch(`${base}/storage/v1/object/relationship-memories/${path}`,{
    method:"POST",headers:{apikey:key,Authorization:`Bearer ${sessions[0]}`,
      "Content-Type":"image/png","x-upsert":"false"},body:png,signal:AbortSignal.timeout(20000)});
  if(!upload.ok) throw new Error(`Private synthetic photo upload HTTP ${upload.status}`);
  const [photo]=await rest(0,"relationship_media_items",{method:"POST",prefer:"return=representation",
    body:{user_id:ids[0],kind:"photo",provider:"device_gallery",title:"Synthetic one-pixel image",
      object_path:path,mime_type:"image/png",byte_size:png.length}});
  const own=await sign(0,path);
  assert.equal(typeof own.signedURL,"string");
  await sign(1,path,[400,403,404]);
  await sign(2,path,[400,403,404]);
  const publicDownload=await fetch(`${base}/storage/v1/object/public/relationship-memories/${path}`,
    {signal:AbortSignal.timeout(20000)});
  assert.notEqual(publicDownload.status,200);
  await publicDownload.arrayBuffer();
  await share(photo,conn);
  const signed=await sign(1,path);
  assert.equal(typeof signed.signedURL,"string");
  const signedUrl=signed.signedURL.startsWith("http")?signed.signedURL:`${base}/storage/v1${signed.signedURL}`;
  const download=await fetch(signedUrl,{signal:AbortSignal.timeout(20000)});
  assert.equal(download.status,200);
  assert.equal((await download.arrayBuffer()).byteLength,png.length);
  await sign(2,path,[400,403,404]);
  checks.push("private photo uploaded and downloaded only by owner or explicitly reviewed recipient; public access denied");
  await rest(0,"rpc/revoke_relationship_media",{method:"POST",body:{p_item_id:photo.id}});
  await sign(1,path,[400,403,404]);
  await share(photo,conn);
  await consent(false);
  await sign(1,path,[400,403,404]);
  await consent(true);
  await sign(1,path,[400,403,404]);
  await share(photo,conn);
  await change(conn,"disconnected");
  await sign(1,path,[400,403,404]);
  assert.deepEqual(await rest(1,`relationship_media_shares?item_id=eq.${photo.id}`),[]);
  assert.equal((await rest(0,`relationship_media_items?id=eq.${photo.id}`)).length,1);
  checks.push("revoke, consent withdrawal, and disconnect blocked new photo URLs; private original preserved");
  await rest(0,`relationship_media_items?id=eq.${photo.id}`,{method:"DELETE"});
  await call(0,"/storage/v1/object/relationship-memories",{method:"DELETE",body:{prefixes:[path]}});
  await sign(0,path,[400,403,404]);
  checks.push("owner deleted the private memory and its uploaded file");
}catch(error){failure=error.message;process.exitCode=1;}
finally{
  // Remove only paths and accounts created by this run. Never enumerate files.
  let filesCleaned=true;
  if(paths.length){
    const removed=await fetch(`${base}/storage/v1/object/relationship-memories`,{
      method:"DELETE",headers:admin,body:JSON.stringify({prefixes:paths}),
      signal:AbortSignal.timeout(20000)});
    filesCleaned=removed.ok;
    if(!filesCleaned) process.exitCode=1;
  }
  let removedAccounts=0;
  for(const id of ids){
    const removed=await fetch(`${base}/auth/v1/admin/users/${id}`,{
      method:"DELETE",headers:admin,signal:AbortSignal.timeout(20000)});
    if(removed.ok) removedAccounts++; else process.exitCode=1;
  }
  console.log(JSON.stringify({passed:!failure&&filesCleaned&&removedAccounts===ids.length,
    checks,...(failure?{testError:failure}:{}),disposableAccountsCreated:ids.length,
    disposableAccountsRemoved:removedAccounts,syntheticFileCleanupPassed:filesCleaned,
    realPhotosAccessed:false,paidAIRequests:0},null,2));
}
