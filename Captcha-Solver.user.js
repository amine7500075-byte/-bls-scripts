// ==UserScript==
// @name         Captcha Solver (Flask Local) OneLine
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  One-line version
// @match        https://algeria.blsspainglobal.com/dza/NewCaptcha/*
// @match        https://algeria.blsspainglobal.com/dza/newcaptcha/*
// @match        https://algeria.blsspainglobal.com/dza/appointment/newappointment*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/bls-scripts/main/Captcha-Solver.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/bls-scripts/main/Captcha-Solver.user.js
// @connect      127.0.0.1
// ==/UserScript==
(function(){'use strict';const c={flaskUrl:'http://127.0.0.1:5002/',autoSubmit:true};class S{init(){this.o()}isC(){return location.pathname.includes('/newcaptcha/logincaptcha')||location.pathname.includes('/Appointment/AppointmentCaptcha')}t(){return $('.box-label').sort((a,b)=>(parseInt(getComputedStyle(b).zIndex)||0)-(parseInt(getComputedStyle(a).zIndex)||0)).first().text().match(/\d+/)?.[0]||''}g(){return $(':has(> .captcha-img):visible').get().reduce((a,e)=>{(a[Math.floor(e.offsetTop)]??=[]).push(e);return a},[]).flatMap(r=>{const z=r.sort((a,b)=>(parseInt(getComputedStyle(b).zIndex)||0)-(parseInt(getComputedStyle(a).zIndex)||0));return z.slice(0,3).sort((a,b)=>a.offsetLeft-b.offsetLeft)}).map(e=>e.querySelector('img'))}check(b,t){return new Promise(r=>{GM_xmlhttpRequest({method:'GET',url:`${c.flaskUrl}?a=vitstr&b=${encodeURIComponent(b)}&n=${t}`,onload:x=>{try{r(JSON.parse(x.responseText).status==="ok")}catch{r(false)}},onerror:()=>r(false)})})}err(m){$('.validation-summary-valid').html(`<b>${m}</b>`)}async solve(){try{const t=this.t(),g=this.g(),b=await Promise.all(g.map(i=>this.toB(i.src))),m=await Promise.all(b.map((x,i)=>this.check(x,t).then(ok=>ok?i:-1)));m.filter(i=>i!=-1).forEach(i=>g[i].click());if(c.autoSubmit)setTimeout(()=>$('#btnVerify').trigger('click'),0)}catch(e){console.error("Captcha error:",e);this.err("Erreur de résolution du captcha")}}toB(u){return new Promise((r,j)=>{const i=new Image();i.crossOrigin='Anonymous';i.onload=function(){const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);r(c.toDataURL('image/png').split(',')[1])};i.onerror=j;i.src=u})}d(){return $('.validation-summary-errors').length||$('.field-validation-error').length||$('.text-danger').length}o(){const n=setInterval(()=>{if(this.isC()||this.d()){clearInterval(n);this.solve()}},0)}}$(document).ready(()=>new S().init());})();
