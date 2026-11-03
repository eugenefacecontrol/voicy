import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Hero} from './Hero';
const ink = '#111527';
const scenes = [
  {start:0,end:2,code:'2xx',title:'SUCCESS SQUAD',line:'Hey, web developers!',label:'YOUR FRIENDLY NEIGHBORHOOD API GUIDE',color:'#f9d549',tag:'THWIP!',example:'HTTP STATUS CODES'},
  {start:2,end:4,code:'200',title:'OK',line:'The request succeeded.',label:'MISSION 01 / ALL GOOD',color:'#66dccb',tag:'NICE!',example:'GET /missions → 200 OK'},
  {start:4,end:8.5,code:'201',title:'CREATED',line:'A new resource is ready.',label:'MISSION 02 / SOMETHING NEW',color:'#ffb5a1',tag:'POW!',example:'POST /gadgets → 201 Created'},
  {start:8.5,end:12.7,code:'204',title:'NO CONTENT',line:'Success. No response body.',label:'MISSION 03 / NOTHING TO SEND BACK',color:'#b7b1fb',tag:'DONE!',example:'DELETE /webs/42 → 204 No Content'},
  {start:12.7,end:16.4,code:'2xx',title:'MISSION COMPLETE',line:'Three codes. Three successful missions!',label:'API HEROES / ISSUE 001',color:'#f9d549',tag:'YES!',example:'200 OK    201 CREATED    204 NO CONTENT'},
];
const City = () => <svg viewBox="0 0 720 600" width="720" height="600" style={{position:'absolute',bottom:0,left:0}}>
  {[0,1,2,3,4,5,6,7,8].map(i=><g key={i}><rect x={i*90-20} y={180+(i*77)%210} width="79" height="440" fill={i%2?'#233457':'#314571'} stroke={ink} strokeWidth="5"/>{[0,1,2,3,4,5].map(j=><g key={j}><rect x={i*90-8} y={202+(i*77)%210+j*46} width="15" height="23" fill="#fbe3a6"/><rect x={i*90+24} y={202+(i*77)%210+j*46} width="15" height="23" fill="#7783b1"/></g>)}</g>)}
  <path d="M0 35 L720 530 M0 130 L720 420 M720 35 L0 530" stroke={ink} opacity=".12" strokeWidth="3"/>
</svg>;
export const HttpHeroes = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame/fps;
  const scene = scenes.find(s=>t>=s.start&&t<s.end)??scenes[4];
  const local = frame-Math.round(scene.start*fps);
  const pop = spring({frame:local,fps,config:{damping:13,stiffness:180}});
  const ending = t>=12.7;
  return <AbsoluteFill style={{background:scene.color,fontFamily:'Arial, Helvetica, sans-serif',color:ink,overflow:'hidden'}}>
    <AbsoluteFill style={{backgroundImage:'radial-gradient(#11152738 1.5px, transparent 1.5px)',backgroundSize:'10px 10px'}}/>
    <City/>
    <div style={{position:'absolute',inset:22,border:`7px solid ${ink}`,pointerEvents:'none'}}/>
    <div style={{position:'absolute',top:59,left:51,right:51,display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:900,letterSpacing:2}}><span>THE AMAZING WORLD OF APIs</span><span>01 / 2xx</span></div>
    <div style={{position:'absolute',top:102,left:50,right:50,background:ink,color:'#fffbe8',padding:'14px 20px',fontSize:17,fontWeight:900,letterSpacing:1.5}}>{scene.label}</div>
    <div style={{position:'absolute',top:173,left:48,right:48,textAlign:'center',scale:pop,rotate:`${interpolate(pop,[0,1],[-7,-2])}deg`}}>
      <div style={{fontSize:ending?148:180,fontWeight:1000,lineHeight:.98,letterSpacing:-9,WebkitTextStroke:`3px ${ink}`,color:'#fffce9',textShadow:`7px 8px 0 ${ink}`}}>{scene.code}</div>
      <div style={{fontSize:ending?40:57,fontWeight:1000,letterSpacing:-2,lineHeight:1.1,marginTop:15}}>{scene.title}</div>
    </div>
    <div style={{position:'absolute',left:53,right:53,top:443,padding:'22px 23px',background:'#fffce9',border:`5px solid ${ink}`,borderRadius:'45% 42% 42% 12% / 25% 30% 30% 20%',boxShadow:`7px 8px 0 ${ink}`,fontSize:ending?29:33,lineHeight:1.12,fontWeight:900,textAlign:'center',scale:interpolate(local,[0,7],[.9,1],{extrapolateRight:'clamp'}),opacity:interpolate(local,[0,5],[0,1],{extrapolateRight:'clamp'})}}>{scene.line}</div>
    <div style={{position:'absolute',top:536,left:210,width:0,height:0,borderLeft:'27px solid transparent',borderRight:'4px solid transparent',borderTop:`45px solid ${ink}`,rotate:'-16deg'}}/>
    <div style={{position:'absolute',width:570,height:665,left:29,top:550,translate:`0px ${Math.sin(frame*.12)*4}px`,rotate:`${Math.sin(frame*.055)*1.4}deg`}}><Hero gesture={Math.sin(frame*.10)*8}/></div>
    <div style={{position:'absolute',top:740,right:39,color:'#fffce9',fontSize:45,fontWeight:1000,fontStyle:'italic',rotate:'12deg',WebkitTextStroke:`2px ${ink}`,textShadow:`4px 4px 0 ${ink}`,scale:1+Math.sin(frame*.16)*.04}}>{scene.tag}</div>
    <div style={{position:'absolute',bottom:86,left:47,right:47,padding:'19px 15px',background:ink,color:'#fffce9',border:'4px solid #fffce9',boxShadow:`5px 5px 0 ${ink}`,fontFamily:'monospace',fontWeight:800,fontSize:ending?17:22,textAlign:'center'}}>{scene.example}</div>
    <div style={{position:'absolute',bottom:47,left:51,right:51,display:'flex',gap:10}}>{['200','201','204'].map(code=><div key={code} style={{flex:1,height:7,background:ending||scene.code===code?ink:'#11152744'}}/>)}</div>
  </AbsoluteFill>;
};
