/**
 * 构建紧凑型 xsudoku 模板 — 模仿 big/digital 模板格式
 * 关键差异: 裁剪白边，数字紧贴边界，24×36 风格
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
const TEMPLATE_DIR = join(__dirname, "..", "templates");

const A = ["006002800080600270025000061604070032200304700030201900042080600160925007000006020","005070080030504100000308057500000090080406510004005008056003041140050600070641005","010073005005009130309156870050690700000708050002345001037560200006007510500900007","002005090000800004080000200006000905090001003230000780008506070000400009060070300","043009100816037009097100080734910026625370910981060700350001000460700001179040000","600009005020536047005100609007900513080300974300400286000603751000701490000090360","700208005020050070000000200308010062200805731070320800030070010007590306600183407","310420600020009010009001002032094801080270030040138200070853926203940100098012040","726894315590106000081520000100602450048050100050401000015068020060310500800245001","002068040306020008890070620060490872980002406020086010630249085008600200209810060","813406902570120004402003010925341786104207080080045201600004120008010000001700000","704100069030600407096070023017060030460700001309010746641087390978306004253941678","000197082802050079070020400000900000006005730500030004400500200020089047000000060","034705000728614009600023400800070000370008002002030800263047001497001060581300704","010300040030009200700000038042090070000720400087134092000057010401083020009200300","003800400600400003040030009004000930932018004567943218458200391206380745370004862","140007090002930147907041006001000904058409710409013085700100400090304001014802000","010090703009007010000005490000250009020700000600080070200400307070508000001070050","203007500780563204450200370530920040024005900697834125902050400305009002040302059","060004082002803675500672904006738000000900008000020700900267843003089007070305200","620079103000100060001306500100687009039215706006493015000000001900031050018000000","007006000500010600601205000106030028800652100002108006305860200214593867068020030","120060000006100009400008010200000400004050923090234071051003007000600130300010090","402695308000708025850200009200901080060800092908402500500380206080526900623109850","003008600400000358050300009002090013900003086030004097000005060006200805085060004","210460900408190006396070140001009004640210000509604017004001300100040000000006401","038006020014023000692500003853069000921300006467218359280004030049600005070000400","302090508005328040089500230820900074003481625004000890007600480000839702008040050","500678210008419075071253480107806530800105790050147108400702801010084007780501940","000800540400630208080004000804070350500008907060350824000002700600000005070010002","641208900700040008890071046270800401164723895080014700028460000416007080907182604","005000001090170052102053006051300249040521003200004510060019025027635104510040000","000100002021000038800027100003890050080040300100006084200010060010004800050600013","020493008053708640480006030340079086005800304008304000530940867804037900070085403","010786400408905070907104000004697020000841000070352046700209004002408300040503010","500060079098107056070003800000004060730200001009001000000000008980000020010080700","103570000058103070796284513030407050579018042600725700900000080007002400060000000","120089674004016002000402510401053200002048156500201340010807420700124000248095701","204500003358040720006002450402007500005900042080254376503781204047020005820405007","000000001080200600006010020050006040004950062600300100300800010040007009005090000"];

function decodePNG(buf){return PNG.sync.read(buf);}
function ga(d,w,x,y){const i=(Math.round(y)*w+Math.round(x))*4;return Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);}
function rd(d,w,y,th){let c=0;const rs=Math.round(y)*w*4;for(let x=0;x<w;x++){const i=rs+x*4;if(Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<th)c++;}return c;}
function cd(d,w,h,x,th){let c=0;for(let y=0;y<h;y++){const i=y*w*4+Math.round(x)*4;if(Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<th)c++;}return c;}
function dgl(d,w,h){const dt=100;function fe(s,fs){const th=0.08;const ix=fs?Array.from({length:s.length},(_,i)=>i):Array.from({length:s.length},(_,i)=>s.length-1-i);let pp=null,ps=0;for(const i of ix){if(s[i].score>th){if(s[i].score>ps){ps=s[i].score;pp=s[i].pos;}}else if(pp!==null)return pp;}return pp;}function lfb(s,e){const sp=e-s;return Array.from({length:10},(_,i)=>Math.round(s+i*sp/9));}const rs=Array.from({length:h},(_,y)=>({pos:y,score:rd(d,w,y,dt)/w}));const tb=fe(rs,true),bb=fe(rs,false);let hl=(tb!=null&&bb!=null&&bb-tb>h*0.45)?lfb(tb,bb):Array.from({length:10},(_,i)=>Math.round((i/9)*(h-1)));const cs=Array.from({length:w},(_,x)=>({pos:x,score:cd(d,w,h,x,dt)/h}));const lb=fe(cs,true),rb=fe(cs,false);let vl=(lb!=null&&rb!=null&&rb-lb>w*0.45)?lfb(lb,rb):Array.from({length:10},(_,i)=>Math.round((i/9)*(w-1)));return{horizontal:hl,vertical:vl};}
function ec(d,w,x1,y1,x2,y2){const pw=Math.round(x2-x1),ph=Math.round(y2-y1);const px=[];for(let y=0;y<ph;y++){const row=[];for(let x=0;x<pw;x++)row.push(255-ga(d,w,Math.round(x1+x),Math.round(y1+y)));px.push(row);}return{pixels:px,w:pw,h:ph};}
function scaleTo(input,inW,inH,outW,outH){const out=[];for(let y=0;y<outH;y++){const row=[],srcY=(y/outH)*inH,y0=Math.floor(srcY),y1=Math.min(y0+1,inH-1),yF=srcY-y0;for(let x=0;x<outW;x++){const srcX=(x/outW)*inW,x0=Math.floor(srcX),x1=Math.min(x0+1,inW-1),xF=srcX-x0;const v00=input[y0]?.[x0]??0,v10=input[y0]?.[x1]??0,v01=input[y1]?.[x0]??0,v11=input[y1]?.[x1]??0;row.push((v00*(1-xF)+v10*xF)*(1-yF)+(v01*(1-xF)+v11*xF)*yF);}out.push(row);}return out;}
function ncc(input,tpl){if(!tpl.pixels||tpl.pixels.length===0)return 0;const tH=tpl.h,tW=tpl.w,iH=input.length,iW=input[0]?.length||0;if(iH===0||iW===0)return 0;const scaled=scaleTo(input,iW,iH,tW,tH);let iSum=0;for(let y=0;y<tH;y++)for(let x=0;x<tW;x++)iSum+=scaled[y][x];const iMean=iSum/(tW*tH);let num=0,dI=0,dT=0;const tMean=tpl.mean||0;for(let y=0;y<tH;y++){for(let x=0;x<tW;x++){const iD=scaled[y][x]-iMean,tD=tpl.pixels[y][x]-tMean;num+=iD*tD;dI+=iD*iD;dT+=tD*tD;}}const denom=Math.sqrt(dI*dT);if(denom<1e-6)return 0;return num/denom;}

/**
 * 裁剪白边：找到数字的精确包围盒
 */
function trimWhitespace(pixels, w, h) {
  let top=h,bottom=0,left=w,right=0;
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){if(pixels[y][x]>20){if(y<top)top=y;if(y>bottom)bottom=y;if(x<left)left=x;if(x>right)right=x;}}}
  if(top>bottom) return {pixels:[[0]],w:1,h:1};
  // 2px padding
  top=Math.max(0,top-2); bottom=Math.min(h-1,bottom+2);
  left=Math.max(0,left-2); right=Math.min(w-1,right+2);
  const nw=right-left+1, nh=bottom-top+1;
  const out=[];
  for(let y=0;y<nh;y++){const row=[];for(let x=0;x<nw;x++)row.push(pixels[top+y][left+x]);out.push(row);}
  return {pixels:out,w:nw,h:nh};
}

function main() {
  mkdirSync(TEMPLATE_DIR,{recursive:true});

  // ── Step 1: Extract ALL trimmed samples ──
  console.log("=== 提取所有样本并裁剪白边 ===\n");
  const allTrimmed=[];

  for(let pi=0;pi<40;pi++){
    const pn=pi+1,answer=A[pi];
    const buf=readFileSync(join(XSUDOKU_DIR,`${pn}.png`));
    const png=decodePNG(buf);const {data,width:w,height:h}=png;
    const grid=dgl(data,w,h);
    const hL=grid.horizontal.slice(0,10),vL=grid.vertical.slice(0,10);

    for(let r=0;r<9;r++){for(let c=0;c<9;c++){
      const expected=parseInt(answer[r*9+c],10);
      if(expected===0)continue;
      const x1=vL[c],y1=hL[r],x2=vL[c+1],y2=hL[r+1];
      const cw=x2-x1,ch=y2-y1;if(cw<10||ch<10)continue;
      const inset=Math.max(2,cw*0.10);
      const {pixels}=ec(data,w,x1+inset,y1+inset,x2-inset,y2-inset);
      const bw=Math.round(x2-x1-2*inset),bh=Math.round(y2-y1-2*inset);
      let mv=0;for(const row of pixels)for(const v of row)if(v>mv)mv=v;
      if(mv<30)continue;
      const trimmed=trimWhitespace(pixels,bw,bh);
      allTrimmed.push({digit:expected,...trimmed});
    }}
  }

  const byDigit={};for(let d=1;d<=9;d++)byDigit[d]=[];
  for(const s of allTrimmed) byDigit[s.digit].push(s);
  for(let d=1;d<=9;d++) console.log(`  数字${d}: ${byDigit[d].length} 样本 (裁剪后)`);

  // ── Step 2: Pick common size per digit, normalize all, average ──
  console.log("\n=== 构建紧凑模板 ===\n");
  const templates={};

  for(let d=1;d<=9;d++){
    const samples=byDigit[d];
    if(samples.length===0) continue;

    // Find most common trimmed size
    const sz={};for(const s of samples){const k=`${s.w}x${s.h}`;sz[k]=(sz[k]||0)+1;}
    let best='',bestN=0;for(const[k,n]of Object.entries(sz))if(n>bestN){bestN=n;best=k;}
    const[tw,th]=best.split('x').map(Number);

    // Normalize all to this size
    const norm=[];
    for(const s of samples){
      let np=s.pixels;
      if(s.w!==tw||s.h!==th) np=scaleTo(s.pixels,s.w,s.h,tw,th);
      norm.push(np);
    }

    // Average
    const avg=[];
    for(let y=0;y<th;y++){avg[y]=[];for(let x=0;x<tw;x++){let sum=0;for(const np of norm)sum+=np[y][x];avg[y][x]=Math.round(sum/norm.length);}}

    let darkCount=0,totalSum=0;
    for(let y=0;y<th;y++)for(let x=0;x<tw;x++){if(avg[y][x]>128)darkCount++;totalSum+=avg[y][x];}
    const mean=totalSum/(tw*th);

    // Pick top-3 closest to mean as individual samples
    const scored=norm.map((np,i)=>({idx:i,score:ncc(np,{w:tw,h:th,pixels:avg,mean})}));
    scored.sort((a,b)=>b.score-a.score);
    const topSamples=scored.slice(0,3).map(s=>({pixels:norm[s.idx],darkCount:0}));
    // Include mean as first sample (like big templates)
    const allSamples=[{pixels:avg,darkCount},...topSamples];

    templates[d]={w:tw,h:th,samples:allSamples};

    // pct = darkCount/(tw*th)*100
    const pct=(darkCount/(tw*th)*100).toFixed(1);
    console.log(`  数字${d}: ${tw}x${th} (暗像素${pct}%), ${samples.length}→${allSamples.length}样本`);
  }

  // ── Step 3: Write ──
  console.log("\n=== 写出模板 ===\n");
  for(let d=1;d<=9;d++){
    const t=templates[d];
    writeFileSync(join(TEMPLATE_DIR,`xsudoku_${d}.json`),JSON.stringify({w:t.w,h:t.h,samples:t.samples},null,2));
    console.log(`  xsudoku_${d}.json`);
  }

  // ── Step 4: Test ──
  console.log("\n=== 阈值扫描 ===\n");
  const tplCache=[];
  for(let d=1;d<=9;d++) if(templates[d]){
    for(const s of templates[d].samples){
      let sum=0,n=0;for(const row of s.pixels)for(const v of row){sum+=v;n++;}
      tplCache.push({digit:d,w:templates[d].w,h:templates[d].h,pixels:s.pixels,mean:sum/n});
    }
  }
  console.log(`模板库: ${tplCache.length} samples (${tplCache.filter(t=>t.digit===1).length}/digit avg)`);

  for(const thr of [0.55,0.60,0.62,0.63,0.64,0.65,0.66,0.67,0.68,0.70,0.72,0.75]){
    let correct=0,missed=0,wrong=0,fp=0;
    for(let pi=0;pi<40;pi++){
      const pn=pi+1,answer=A[pi];
      const buf=readFileSync(join(XSUDOKU_DIR,`${pn}.png`));
      const png=decodePNG(buf);const {data,width:w,height:h}=png;
      const grid=dgl(data,w,h);const hL=grid.horizontal.slice(0,10),vL=grid.vertical.slice(0,10);
      for(let r=0;r<9;r++){for(let c=0;c<9;c++){
        const expected=parseInt(answer[r*9+c],10);
        const x1=vL[c],y1=hL[r],x2=vL[c+1],y2=hL[r+1];const cw=x2-x1,ch=y2-y1;if(cw<5||ch<5)continue;
        const inset=Math.max(2,cw*0.10);
        const {pixels}=ec(data,w,x1+inset,y1+inset,x2-inset,y2-inset);
        const bw=Math.round(x2-x1-2*inset),bh=Math.round(y2-y1-2*inset);
        let mv=0;for(const row of pixels)for(const v of row)if(v>mv)mv=v;
        let got=0;
        if(mv>=30&&bw>=5&&bh>=5){
          let bs=-Infinity,bd=0;
          for(const tp of tplCache){const sc=ncc(pixels,tp);if(sc>bs){bs=sc;bd=tp.digit;}}
          if((bs+1)/2>thr) got=bd;
        }
        if(expected===0&&got===0) correct++;
        else if(expected===got) correct++;
        else{if(expected!==0&&got===0)missed++;else if(expected===0&&got!==0)fp++;else wrong++;}
      }}
    }
    const acc=(correct/(40*81)*100).toFixed(2);
    let st=[];if(missed)st.push(`漏识${missed}`);if(wrong)st.push(`错识${wrong}`);if(fp)st.push(`误报${fp}`);
    console.log(`  阈值${thr.toFixed(2)}: ${acc}% ${st.length?st.join(","):'✓'}`);
  }

  // Show specific errors at best threshold
  console.log("\n=== 最佳阈值 0.65 详细错误 ===\n");
  for(let pi=0;pi<40;pi++){
    const pn=pi+1,answer=A[pi];
    const buf=readFileSync(join(XSUDOKU_DIR,`${pn}.png`));
    const png=decodePNG(buf);const {data,width:w,height:h}=png;
    const grid=dgl(data,w,h);const hL=grid.horizontal.slice(0,10),vL=grid.vertical.slice(0,10);
    for(let r=0;r<9;r++){for(let c=0;c<9;c++){
      const expected=parseInt(answer[r*9+c],10);
      const x1=vL[c],y1=hL[r],x2=vL[c+1],y2=hL[r+1];const cw=x2-x1,ch=y2-y1;if(cw<5||ch<5)continue;
      const inset=Math.max(2,cw*0.10);
      const {pixels}=ec(data,w,x1+inset,y1+inset,x2-inset,y2-inset);
      const bw=Math.round(x2-x1-2*inset),bh=Math.round(y2-y1-2*inset);
      let mv=0;for(const row of pixels)for(const v of row)if(v>mv)mv=v;
      let got=0,bestConf=0;
      if(mv>=30&&bw>=5&&bh>=5){
        let bs=-Infinity,bd=0;
        for(const tp of tplCache){const sc=ncc(pixels,tp);if(sc>bs){bs=sc;bd=tp.digit;}}
        bestConf=(bs+1)/2;
        if(bestConf>0.65) got=bd;
      }
      if(expected!==got){
        const cell=`${String.fromCharCode(65+r)}${c+1}`;
        console.log(`  #${pn} ${cell}: expected ${expected}, got ${got}, conf=${bestConf.toFixed(3)}`);
      }
    }}
  }
}

main();
