const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
// Safari (macOS 15) reported "Could not prepare video playback position (10.001s; readyState=1)"
// on every MP4 export: the file outlasts its video track, so the time just before the end has no frame.
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const locale of ['', 'en/']){
 const page=await browser.newPage();await page.route('**/*',r=>r.request().url()==='http://127.0.0.1/'?r.fulfill({contentType:'text/html',body:fs.readFileSync(locale+'index.html')}):r.abort());await page.goto('http://127.0.0.1/');
 const result=await page.evaluate(async()=>{
  // Frames exist up to lastFrame. Later times finish seeking but stay at HAVE_METADATA, like Safari.
  class Video extends EventTarget{
   constructor(lastFrame,delay=20){super();this.duration=10.002;this.lastFrame=lastFrame;this.delay=delay;this.readyState=2;this.paused=true;this.seeking=false;this.error=null;this.time=0;this.seekCalls=0;this.playbackRate=1;}
   get currentTime(){return this.time;}
   set currentTime(time){this.time=time;this.seeking=true;this.readyState=1;this.seekCalls++;setTimeout(()=>{if(this.time!==time)return;this.seeking=false;if(time<=this.lastFrame){this.readyState=2;this.dispatchEvent(new Event('seeked'));}},this.delay);}
   pause(){this.paused=true;}
   play(){this.paused=false;return Promise.resolve();}
  }
  const out={},tail=new Video(9.98);let started=performance.now();
  try{await J.seekMediaVideo(tail,10.001,null,'x.mp4');out.tail={time:tail.currentTime,ms:performance.now()-started,ready:tail.readyState};}catch(error){out.tail={error:error.message};}
  // Later export frames ask for the same end time again; they must reuse the frame found above.
  const seeks=tail.seekCalls;started=performance.now();await J.seekMediaVideo(tail,10.001);await J.seekMediaVideo(tail,10.0015);out.repeat={extraSeeks:tail.seekCalls-seeks,ms:performance.now()-started};
  // Moving elsewhere afterwards is an ordinary exact seek again.
  await J.seekMediaVideo(tail,4);out.after={time:tail.currentTime};
  // A slow but working seek in the middle of the clip must not be replaced by an earlier frame.
  const slow=new Video(10.002,2000);await J.seekMediaVideo(slow,5);out.slow={time:slow.currentTime,seekCalls:slow.seekCalls};
  return out;
 });
 assert.equal(result.tail.error,undefined,JSON.stringify(result.tail));assert.ok(result.tail.time<=9.98&&result.tail.time>9.9,'Use the last decodable frame '+JSON.stringify(result.tail));assert.ok(result.tail.ms<5000,'The fallback must not wait for the 15 s timeout');
 assert.equal(result.repeat.extraSeeks,0,'Repeated end frames must reuse the substitute frame');assert.ok(result.repeat.ms<100);
 assert.equal(result.after.time,4);assert.equal(result.slow.time,5);assert.equal(result.slow.seekCalls,1);
 console.log('PASS video tail seek '+(locale||'ja')+' '+JSON.stringify(result));await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
