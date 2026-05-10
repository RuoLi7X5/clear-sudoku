/**
 * Xsudoku 模板独立验证
 * 仅用 xsudoku 模板识别，对比答案，分析错误模式
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
const OUTPUT_DIR = join(__dirname, "..", "xsudoku-verify");

const ANSWERS = [
  "006002800080600270025000061604070032200304700030201900042080600160925007000006020",
  "005070080030504100000308057500000090080406510004005008056003041140050600070641005",
  "010073005005009130309156870050690700000708050002345001037560200006007510500900007",
  "002005090000800004080000200006000905090001003230000780008506070000400009060070300",
  "043009100816037009097100080734910026625370910981060700350001000460700001179040000",
  "600009005020536047005100609007900513080300974300400286000603751000701490000090360",
  "700208005020050070000000200308010062200805731070320800030070010007590306600183407",
  "310420600020009010009001002032094801080270030040138200070853926203940100098012040",
  "726894315590106000081520000100602450048050100050401000015068020060310500800245001",
  "002068040306020008890070620060490872980002406020086010630249085008600200209810060",
  "813406902570120004402003010925341786104207080080045201600004120008010000001700000",
  "704100069030600407096070023017060030460700001309010746641087390978306004253941678",
  "000197082802050079070020400000900000006005730500030004400500200020089047000000060",
  "034705000728614009600023400800070000370008002002030800263047001497001060581300704",
  "010300040030009200700000038042090070000720400087134092000057010401083020009200300",
  "003800400600400003040030009004000930932018004567943218458200391206380745370004862",
  "140007090002930147907041006001000904058409710409013085700100400090304001014802000",
  "010090703009007010000005490000250009020700000600080070200400307070508000001070050",
  "203007500780563204450200370530920040024005900697834125902050400305009002040302059",
  "060004082002803675500672904006738000000900008000020700900267843003089007070305200",
  "620079103000100060001306500100687009039215706006493015000000001900031050018000000",
  "007006000500010600601205000106030028800652100002108006305860200214593867068020030",
  "120060000006100009400008010200000400004050923090234071051003007000600130300010090",
  "402695308000708025850200009200901080060800092908402500500380206080526900623109850",
  "003008600400000358050300009002090013900003086030004097000005060006200805085060004",
  "210460900408190006396070140001009004640210000509604017004001300100040000000006401",
  "038006020014023000692500003853069000921300006467218359280004030049600005070000400",
  "302090508005328040089500230820900074003481625004000890007600480000839702008040050",
  "500678210008419075071253480107806530800105790050147108400702801010084007780501940",
  "000800540400630208080004000804070350500008907060350824000002700600000005070010002",
  "641208900700040008890071046270800401164723895080014700028460000416007080907182604",
  "005000001090170052102053006051300249040521003200004510060019025027635104510040000",
  "000100002021000038800027100003890050080040300100006084200010060010004800050600013",
  "020493008053708640480006030340079086005800304008304000530940867804037900070085403",
  "010786400408905070907104000004697020000841000070352046700209004002408300040503010",
  "500060079098107056070003800000004060730200001009001000000000008980000020010080700",
  "103570000058103070796284513030407050579018042600725700900000080007002400060000000",
  "120089674004016002000402510401053200002048156500201340010807420700124000248095701",
  "204500003358040720006002450402007500005900042080254376503781204047020005820405007",
  "000000001080200600006010020050006040004950062600300100300800010040007009005090000",
];

function decodePNG(buf) { return PNG.sync.read(buf); }
function grayAt(data, imgW, x, y) {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2]);
}
function rowDarkness(data, imgW, y, th) {
  let c=0; const rs=Math.round(y)*imgW*4;
  for (let x=0; x<imgW; x++) { const idx=rs+x*4; if (Math.round(0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2])<th) c++; }
  return c;
}
function colDarkness(data, imgW, imgH, x, th) {
  let c=0; for (let y=0; y<imgH; y++) { const idx=y*imgW*4+Math.round(x)*4; if (Math.round(0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2])<th) c++; }
  return c;
}
function detectGridLines(data, imgW, imgH) {
  const dt=100;
  function fe(s,fs) {
    const th=0.08; const ix=fs?Array.from({length:s.length},(_,i)=>i):Array.from({length:s.length},(_,i)=>s.length-1-i);
    let pp=null,ps=0; for (const i of ix) { if(s[i].score>th){if(s[i].score>ps){ps=s[i].score;pp=s[i].pos;}}else if(pp!==null)return pp; }
    return pp;
  }
  function lfb(s,e){const sp=e-s; return Array.from({length:10},(_,i)=>Math.round(s+i*sp/9));}
  const rs=Array.from({length:imgH},(_,y)=>({pos:y,score:rowDarkness(data,imgW,y,dt)/imgW}));
  const tb=fe(rs,true),bb=fe(rs,false);
  let h=(tb!=null&&bb!=null&&bb-tb>imgH*0.45)?lfb(tb,bb):Array.from({length:10},(_,i)=>Math.round((i/9)*(imgH-1)));
  const cs=Array.from({length:imgW},(_,x)=>({pos:x,score:colDarkness(data,imgW,imgH,x,dt)/imgH}));
  const lb=fe(cs,true),rb=fe(cs,false);
  let v=(lb!=null&&rb!=null&&rb-lb>imgW*0.45)?lfb(lb,rb):Array.from({length:10},(_,i)=>Math.round((i/9)*(imgW-1)));
  return {horizontal:h,vertical:v};
}
function extractCell(data,imgW,x1,y1,x2,y2) {
  const w=Math.round(x2-x1),h=Math.round(y2-y1);
  const px=[]; for (let y=0;y<h;y++){const row=[];for(let x=0;x<w;x++){row.push(255-grayAt(data,imgW,Math.round(x1+x),Math.round(y1+y)));} px.push(row);}
  return {pixels:px,w,h};
}

// ── NCC matching (inline, xsudoku-only) ──
function scaleTo(input,inW,inH,outW,outH) {
  const out=[];
  for (let y=0;y<outH;y++){
    const row=[],srcY=(y/outH)*inH,y0=Math.floor(srcY),y1=Math.min(y0+1,inH-1),yF=srcY-y0;
    for (let x=0;x<outW;x++){
      const srcX=(x/outW)*inW,x0=Math.floor(srcX),x1=Math.min(x0+1,inW-1),xF=srcX-x0;
      const v00=input[y0]?.[x0]??0,v10=input[y0]?.[x1]??0,v01=input[y1]?.[x0]??0,v11=input[y1]?.[x1]??0;
      row.push((v00*(1-xF)+v10*xF)*(1-yF)+(v01*(1-xF)+v11*xF)*yF);
    } out.push(row);
  } return out;
}
function ncc(input,tpl){
  if(!tpl.pixels||tpl.pixels.length===0)return 0;
  const tH=tpl.h,tW=tpl.w,iH=input.length,iW=input[0]?.length||0;
  if(iH===0||iW===0)return 0;
  const scaled=scaleTo(input,iW,iH,tW,tH);
  let iSum=0; for(let y=0;y<tH;y++)for(let x=0;x<tW;x++)iSum+=scaled[y][x];
  const iMean=iSum/(tW*tH);
  let num=0,dI=0,dT=0; const tMean=tpl.mean||0;
  for(let y=0;y<tH;y++){for(let x=0;x<tW;x++){const iD=scaled[y][x]-iMean,tD=tpl.pixels[y][x]-tMean;num+=iD*tD;dI+=iD*iD;dT+=tD*tD;}}
  const denom=Math.sqrt(dI*dT); if(denom<1e-6)return 0;
  return num/denom;
}

// ── Load xsudoku templates ──
const XSUDOKU_TEMPLATES = [];
function loadXsudokuTemplates() {
  const dirs = [join(__dirname,"..","templates"), join(__dirname,"..","..","templates")];
  for (let d=1;d<=9;d++){
    let loaded=false;
    for (const dir of dirs){
      const path=join(dir,`xsudoku_${d}.json`);
      try {
        const raw=JSON.parse(readFileSync(path,"utf-8"));
        const entries=raw.samples||[{pixels:raw.pixels,darkCount:raw.darkCount||0}];
        for(const e of entries){
          let sum=0,n=0;
          for(const row of e.pixels)for(const v of row){sum+=v;n++;}
          XSUDOKU_TEMPLATES.push({digit:d,w:raw.w,h:raw.h,pixels:e.pixels,mean:sum/n});
        }
        loaded=true; break;
      } catch(e) { /* not found */ }
    }
    if(!loaded) console.log(`  ⚠ xsudoku_${d}.json not found!`);
  }
  console.log(`加载了 ${XSUDOKU_TEMPLATES.length} 个 xsudoku 模板样本`);
}

function matchXsudoku(pixels, w, h, threshold) {
  let maxVal=0; for(const row of pixels)for(const v of row)if(v>maxVal)maxVal=v;
  if(maxVal<30) return {digit:0,confidence:0};
  let bestDigit=0,bestScore=-Infinity;
  for(const tpl of XSUDOKU_TEMPLATES){
    const score=ncc(pixels,tpl);
    if(score>bestScore){bestScore=score;bestDigit=tpl.digit;}
  }
  const conf=(bestScore+1)/2;
  if(conf>threshold) return {digit:bestDigit,confidence:conf};
  return {digit:0,confidence:0};
}

// ═══════════════════ Main ═══════════════════

function main() {
  mkdirSync(OUTPUT_DIR,{recursive:true});
  loadXsudokuTemplates();

  console.log("\n=== 仅用 xsudoku 模板，阈值扫描 ===\n");

  // Sweep thresholds
  for (const threshold of [0.50, 0.55, 0.60, 0.65, 0.70, 0.75]) {
    let totalCells=40*81, correct=0, missed=0, wrong=0, fp=0;
    const errors=[]; // {puzzle,cell,expected,got,conf}

    for (let pi=0;pi<40;pi++){
      const pn=pi+1,answer=ANSWERS[pi];
      const buf=readFileSync(join(XSUDOKU_DIR,`${pn}.png`));
      const png=decodePNG(buf); const {data,width:imgW,height:imgH}=png;
      const grid=detectGridLines(data,imgW,imgH);
      const hL=grid.horizontal.slice(0,10),vL=grid.vertical.slice(0,10);

      for(let r=0;r<9;r++){for(let c=0;c<9;c++){
        const expected=parseInt(answer[r*9+c],10);
        const x1=vL[c],y1=hL[r],x2=vL[c+1],y2=hL[r+1];
        const cw=x2-x1,ch=y2-y1; if(cw<5||ch<5)continue;
        const inset=Math.max(2,cw*0.10);
        const {pixels}=extractCell(data,imgW,x1+inset,y1+inset,x2-inset,y2-inset);
        const bw=Math.round(x2-x1-2*inset),bh=Math.round(y2-y1-2*inset);
        const result=matchXsudoku(pixels,bw,bh,threshold);
        const got=result.digit;

        if(expected===0&&got===0) correct++;
        else if(expected===got) correct++;
        else {
          if(expected!==0&&got===0) missed++;
          else if(expected===0&&got!==0) fp++;
          else wrong++;
          errors.push({puzzle:pn,cell:`${String.fromCharCode(65+r)}${c+1}`,expected,got,conf:result.confidence});
        }
      }}
    }

    const acc=(correct/totalCells*100).toFixed(1);
    console.log(`  阈值${threshold.toFixed(2)}: ${acc}% 漏识=${missed} 错识=${wrong} 误报=${fp} 总计错=${errors.length}`);
  }

  // ── Detailed analysis at best threshold (0.55-0.60) ──
  console.log("\n=== 详细分析 (阈值=0.60) ===\n");
  const THR=0.60;
  const errors=[], confusion={}, fpByDigit={}, missedByDigit={};

  for (let pi=0;pi<40;pi++){
    const pn=pi+1,answer=ANSWERS[pi];
    const buf=readFileSync(join(XSUDOKU_DIR,`${pn}.png`));
    const png=decodePNG(buf); const {data,width:imgW,height:imgH}=png;
    const grid=detectGridLines(data,imgW,imgH);
    const hL=grid.horizontal.slice(0,10),vL=grid.vertical.slice(0,10);

    let puzzleErrors=0;
    for(let r=0;r<9;r++){for(let c=0;c<9;c++){
      const expected=parseInt(answer[r*9+c],10);
      const x1=vL[c],y1=hL[r],x2=vL[c+1],y2=hL[r+1];
      const cw=x2-x1,ch=y2-y1; if(cw<5||ch<5)continue;
      const inset=Math.max(2,cw*0.10);
      const {pixels}=extractCell(data,imgW,x1+inset,y1+inset,x2-inset,y2-inset);
      const bw=Math.round(x2-x1-2*inset),bh=Math.round(y2-y1-2*inset);
      const result=matchXsudoku(pixels,bw,bh,THR);
      const got=result.digit;
      if(expected!==got) {
        puzzleErrors++;
        errors.push({puzzle:pn,cell:`${String.fromCharCode(65+r)}${c+1}`,expected,got,conf:result.confidence});
        // Track confusion pairs
        if(expected!==0 && got!==0) {
          const key=`${expected}→${got}`;
          if(!confusion[key]) confusion[key]=[];
          confusion[key].push({puzzle:pn,cell:`${String.fromCharCode(65+r)}${c+1}`});
        }
        if(expected===0 && got!==0) {
          if(!fpByDigit[got]) fpByDigit[got]=0; fpByDigit[got]++;
        }
        if(expected!==0 && got===0) {
          if(!missedByDigit[expected]) missedByDigit[expected]=0; missedByDigit[expected]++;
        }
      }
    }}
    const acc=((81-puzzleErrors)/81*100).toFixed(1);
    if(puzzleErrors>0) console.log(`  #${pn}: ${acc}% (${puzzleErrors}错)`);
    else console.log(`  #${pn}: ${acc}% ✓`);
  }

  console.log(`\n错误总数: ${errors.length}`);

  console.log("\n混淆对 (expected→got):");
  const sortedConf=Object.entries(confusion).sort((a,b)=>b[1].length-a[1].length);
  for(const [pair,cases] of sortedConf) console.log(`  ${pair}: ${cases.length}次`);

  console.log("\n漏识数字 (given→0):");
  for(let d=1;d<=9;d++) if(missedByDigit[d]) console.log(`  数字${d}: ${missedByDigit[d]}次`);

  console.log("\n误报数字 (0→digit):");
  for(let d=1;d<=9;d++) if(fpByDigit[d]) console.log(`  数字${d}: ${fpByDigit[d]}次`);

  // Save error details
  writeFileSync(join(OUTPUT_DIR,"errors.json"),JSON.stringify(errors,null,2));
  writeFileSync(join(OUTPUT_DIR,"confusion.json"),JSON.stringify(sortedConf,null,2));
  console.log(`\n详细数据: ${OUTPUT_DIR}`);
}

main();
