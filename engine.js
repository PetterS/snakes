/* Deep Below's deterministic simulation. No browser or network dependencies. */
'use strict';
(function (root) {
  const WIDTH = 58, HEIGHT = 184, SURFACE = 3, GATE_Y = 94, GATE_X = 29;
  const DIRS = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
  const BIOMES = [
    {name:'Rotdjupet', color:'#b8ca72', soil:['#554c36','#5f533b','#61563f'], floor:'#252c25', snake:'#a0b968'},
    {name:'Kristallkatedralen', color:'#94c8f5', soil:['#46465e','#4e4e68','#56516a'], floor:'#242638', snake:'#9b8bd3'},
    {name:'Glödvalvet', color:'#f3a475', soil:['#62433d','#69463b','#714c40'], floor:'#302321', snake:'#e49c67'},
    {name:'Asksvalget', color:'#e49aa8', soil:['#40303e','#493342','#503847'], floor:'#201923', snake:'#db738e'},
    {name:'De namnlösas salar', color:'#aaa0ec', soil:['#323044','#39354c','#403951'], floor:'#181723', snake:'#b295df'},
    {name:'Nattens avgrund', color:'#e47592', soil:['#382b3b','#413044','#473449'], floor:'#1b1421', snake:'#e275a1'}
  ];
  const PERKS = [
    {id:'magnet',icon:'◎',name:'Fickgravitation',text:'Dra till dig diamanter ur jorden omkring dig. Skatterna kommer till dig.'},
    {id:'rich',icon:'◆',name:'Midas gåva',text:'Varje diamant du hittar blir dubbelt så mycket värd.'},
    {id:'drill',icon:'↯',name:'Överväxel',text:'Din borr laddas upp dubbelt så snabbt.'},
    {id:'heart',icon:'♥',name:'Nya krafter',text:'Återfå alla hjärtan och få två extra.'},
    {id:'quiet',icon:'♧',name:'Spökstövlar',text:'Rör dig snabbare. Ormarna hör inte längre när du gräver.'},
    {id:'flares',icon:'✦',name:'Eldvakt',text:'Få fyra bloss. Varje bloss bedövar ormar i ett mycket större område.'},
    {id:'lantern',icon:'☼',name:'Själslykta',text:'Se längre i mörkret. Avslöja dolda rum och reliker på större avstånd.'},
    {id:'ward',icon:'◈',name:'Skuggmantel',text:'Dödsrikets bett och fasor tar bara ett hjärta. Skyddet efter en träff varar längre.'},
    {id:'supplies',icon:'✧',name:'Sista glöden',text:'Få tre bloss och full hälsa. Kistor ger hädanefter två bloss och två hjärtan.'}
  ];
  const UPGRADES = [
    {id:'pick',name:'Diamanthacka',text:'Gräv 12 % snabbare per nivå.',cost:35},
    {id:'boots',name:'Turboborr',text:'Kortare laddningstid för borren.',cost:45},
    {id:'armor',name:'Förstärkt jacka',text:'Börja med ett extra hjärta per nivå.',cost:50}
  ];
  const TRAILS = [
    {name:'bleka fjädrar',color:'#e0b6ed',hint:'Bleka fjädrar visar en väg genom berget. Följ spetsarna; ljuset tätnar nära reliken.'},
    {name:'ögonristningar',color:'#bcbaff',hint:'Ögonristningar vakar i stenen. Deras blick visar vägen till nästa relik.'},
    {name:'glödande sprickor',color:'#f3b2a1',hint:'Glödande sprickor pekar djupare. Följ dem mot det sista gömstället.'}
  ];
  function rng(seed) { let a=seed|0; return () => {a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}; }
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const biomeAt = y => y<32?0:y<62?1:y<=GATE_Y?2:y<124?3:y<154?4:5;
  const key = (x,y) => y*WIDTH+x;
  class Game {
    constructor(seed=Date.now(), upgrades={}) {
      this.seed=seed;this.random=rng(seed);this.upgrades={pick:0,boots:0,armor:0,...upgrades};
      this.width=WIDTH;this.height=HEIGHT;this.state='ready';this.time=0;this.events=[];
      this.grid=Array.from({length:HEIGHT},(_,y)=>Array.from({length:WIDTH},(_,x)=>y<=SURFACE?0:(x===0||x===WIDTH-1||y===HEIGHT-1)?2:1));
      this.seen=new Uint8Array(WIDTH*HEIGHT);this.items=new Map();this.snakes=[];this.horrors=[];this.flares=[];this.perks=new Set();this.choices=[];
      this.encounters=[];this.shortcuts=new Set();this.refuges=[];this.clues=[];this.noiseSource=null;this.tacticsExplained=false;
      this.gate={x:GATE_X,y:GATE_Y,open:false};this.enteredNether=false;
      this.player={x:29,y:SURFACE,oldX:29,oldY:SURFACE,blend:1,dir:2,hp:5+this.upgrades.armor,maxHp:5+this.upgrades.armor,bag:0,flares:3,relics:0,invincible:0,drillCooldown:0,drilling:0};
      this.moveTimer=0;this.noise=0;this.combo=0;this.comboTimer=0;this.maxCombo=0;this.deepest=0;this.lastBiome=0;this.threat=false;this.result=null;
      this.generate();this.reveal(10);
    }
    emit(type,data={}) {this.events.push({type,...data});}
    drainEvents() {return this.events.splice(0);}
    open(x,y) {if(x>0&&x<WIDTH-1&&y>SURFACE&&y<HEIGHT-1)this.grid[y][x]=0;}
    place(x,y,type,value=1,extra={}) {if(x>0&&x<WIDTH-1&&y>SURFACE&&y<HEIGHT-1&&!this.items.has(key(x,y)))this.items.set(key(x,y),{x,y,type,value,...extra});}
    room(cx,cy,rx,ry) {for(let y=cy-ry;y<=cy+ry;y++)for(let x=cx-rx;x<=cx+rx;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<1.25)this.open(x,y);}
    generate() {
      // Each run has generous caves, crooked connecting tunnels, and buried seams.
      for(let n=0;n<32;n++) {
        const x=5+Math.floor(this.random()*(WIDTH-10)),y=9+Math.floor(this.random()*(GATE_Y-15));
        this.room(x,y,3+Math.floor(this.random()*5),2+Math.floor(this.random()*3));
        for(let j=0;j<10;j++)this.open(x+j-5,y+Math.round(Math.sin(j*.7)*2));
      }
      for(let n=0;n<250;n++) {
        const x=3+Math.floor(this.random()*(WIDTH-6)),y=7+Math.floor(this.random()*(GATE_Y-10));
        if(this.random()<.45&&this.grid[y][x]===1)this.grid[y][x]=2;
        else for(let j=0;j<2+Math.floor(this.random()*4);j++)this.place(x+j%3,y+Math.floor(j/3),'gem',biomeAt(y)+1);
      }
      this.relics=[{x:12+Math.floor(this.random()*10),y:24,name:'Vildmarkens hjärta'},
        {x:35+Math.floor(this.random()*10),y:51,name:'Månens tår'},
        {x:17+Math.floor(this.random()*18),y:82,name:'Den sovande solen'}];
      this.relics.forEach((r,i)=>{
        this.room(r.x,r.y,5,4);
        // A shaft of diggable earth guarantees access to each temple.
        for(let y=SURFACE+1;y<=r.y;y++)if(this.grid[y][r.x]===2)this.grid[y][r.x]=1;
        this.items.delete(key(r.x,r.y));this.place(r.x,r.y,'relic',i,{name:r.name});
        for(const d of [-1,1]){this.items.delete(key(r.x+d*3,r.y));this.place(r.x+d*3,r.y,'chest');}
        this.addSnake(r.x,r.y+2,10+i*4,i);
      });
      for(const y of [16,20,42,46,70,74])this.addSnake(8+Math.floor(this.random()*41),y,9+Math.floor(this.random()*7),biomeAt(y));
      for(let i=0;i<18;i++) {let x=4+Math.floor(this.random()*50),y=10+Math.floor(this.random()*80);this.open(x,y);this.place(x,y,'chest');}
      // An inviting, safe opening teaches collecting and cashing out.
      for(let y=4;y<9;y++)for(let x=26;x<33;x++){this.grid[y][x]=1;this.items.delete(key(x,y));}
      [[29,5],[29,6],[30,6],[31,7],[27,8]].forEach(([x,y])=>this.place(x,y,'gem',1));
      this.items.delete(key(29,9));this.place(29,9,'chest');
      this.generateNether();
      this.generateEncounters();
      this.generateRefuges();
      this.generateClues();
      this.generateVeins();
    }
    generateEncounters() {
      const occupied=new Set(this.snakes.flatMap(s=>s.body.map(p=>key(p.x,p.y))));
      for(const r of this.relics) {
        const entry={x:r.x,y:r.y-7};this.encounters.push(entry);
        // Two flanking passages surround a short rock ridge that one drill can pierce.
        for(let y=entry.y;y<=r.y;y++)for(const dx of [-4,0,4])this.open(r.x+dx,y);
        for(let x=r.x-4;x<=r.x+4;x++){this.open(x,entry.y);this.open(x,r.y);}
        for(let y=r.y-5;y<=r.y-3;y++)for(let x=r.x-1;x<=r.x+1;x++) {
          const k=key(x,y),item=this.items.get(k);
          if(!occupied.has(k)&&(!item||item.type==='gem')){this.grid[y][x]=2;this.shortcuts.add(k);}
        }
        // A side alcove gives a dropped flare somewhere to draw the patrol away.
        const side=r.x<WIDTH/2?1:-1;
        for(let j=4;j<=6;j++)this.open(r.x+side*j,r.y-2);
        this.room(r.x+side*6,r.y-2,1,1);
      }
    }
    generateRefuges() {
      const sites=[{y:35,after:0,name:'Rotvilan'},{y:65,after:1,name:'Kristallvilan'},
        {y:127,after:3,name:'Asklyktan'},{y:155,after:4,name:'Minnesljuset'}];
      for(const site of sites) {
        const previous=this.relics[site.after],next=this.relics[site.after+1],aim=Math.round((previous.x+next.x)/2);
        const candidates=Array.from({length:42},(_,i)=>i+8).sort((a,b)=>Math.abs(a-aim)-Math.abs(b-aim));
        const x=candidates.find(x=>this.snakes.every(s=>s.body.every(p=>distance(p,{x,y:site.y})>4.5))&&this.horrors.every(h=>distance(h,{x,y:site.y})>5));
        if(x===undefined)continue;
        const refuge={x,y:site.y,radius:3,name:site.name,after:site.after,visited:false};this.refuges.push(refuge);
        this.room(x,site.y,3,3);
        // A diggable approach keeps the rest stop reachable even in dense nether rock.
        for(const end of [previous,next]){
          for(let y=Math.min(end.y,site.y);y<=Math.max(end.y,site.y);y++)if(this.grid[y][x]===2&&!this.shortcuts.has(key(x,y)))this.grid[y][x]=1;
          for(let xx=Math.min(x,end.x);xx<=Math.max(x,end.x);xx++)if(this.grid[end.y][xx]===2)this.grid[end.y][xx]=1;
        }
        // Relocate a supply chest, rather than adding repeatable healing at the light.
        const supplyDistance=item=>Math.abs(biomeAt(item.y)-biomeAt(site.y))*100+distance(item,refuge);
        const chest=[...this.items.values()].filter(i=>i.type==='chest'&&i.y>9&&(i.y>GATE_Y)===(site.y>GATE_Y)&&!this.refugeAt(i)).sort((a,b)=>supplyDistance(a)-supplyDistance(b))[0];
        const displaced=this.items.get(key(x,site.y));
        if(chest&&displaced?.type!=='chest'){
          this.items.delete(key(chest.x,chest.y));this.items.delete(key(x,site.y));
          if(displaced)this.place(chest.x,chest.y,displaced.type,displaced.value);
          this.place(x,site.y,'chest');
        }
      }
    }
    refugeAt(p) {return this.refuges.find(r=>(r.x-p.x)**2+(r.y-p.y)**2<=r.radius**2)||null;}
    diggableRoute(start,target,between=false) {
      const first=key(start.x,start.y),last=key(target.x,target.y),previous=new Int32Array(WIDTH*HEIGHT).fill(-1),queue=[first];previous[first]=first;
      for(let q=0;q<queue.length&&previous[last]===-1;q++) {
        const k=queue[q],x=k%WIDTH,y=Math.floor(k/WIDTH);
        for(const d of DIRS){const nx=x+d.x,ny=y+d.y,n=key(nx,ny);
          if(nx<1||nx>=WIDTH-1||ny<SURFACE||ny>=HEIGHT-1||previous[n]!==-1||this.grid[ny][nx]>=2||(between&&(ny<start.y||ny>target.y)))continue;
          previous[n]=k;queue.push(n);
        }
      }
      if(previous[last]===-1)return [];
      const path=[];for(let k=last;;k=previous[k]){path.push({x:k%WIDTH,y:Math.floor(k/WIDTH)});if(k===first)break;}
      return path.reverse();
    }
    generateClues() {
      for(let i=3;i<6;i++) {
        const r=this.relics[i],start=i===3?{x:GATE_X,y:GATE_Y+3}:this.relics[i-1];
        const refuge=this.refuges.find(v=>v.after===i-1),stops=refuge?[start,refuge,r]:[start,r];
        let path=[];
        for(let j=1;j<stops.length;j++){
          let leg=this.diggableRoute(stops[j-1],stops[j],true);
          if(!leg.length)leg=this.diggableRoute(stops[j-1],stops[j]);
          path.push(...(j===1?leg:leg.slice(1)));
        }
        // Erase any backtracking at a rest stop so two marks never disagree on direction.
        const simple=[],visited=new Map();
        for(const p of path){const k=key(p.x,p.y);if(visited.has(k)){while(simple.length>visited.get(k)+1){const old=simple.pop();visited.delete(key(old.x,old.y));}}else{visited.set(k,simple.length);simple.push(p);}}
        path=simple;
        for(let j=0;j<path.length-1;j+=3) {
          const p=path[j],next=path[j+1],dir=DIRS.findIndex(d=>p.x+d.x===next.x&&p.y+d.y===next.y);
          this.clues.push({...p,dir,relic:i,strength:1-Math.min(1,distance(p,r)/24)});
        }
      }
    }
    nearbyClue() {
      let nearest=null,best=4;
      for(const clue of this.clues){const d=distance(clue,this.player);if(!this.relics[clue.relic].taken&&this.seen[key(clue.x,clue.y)]&&d<best){nearest=clue;best=d;}}
      return nearest;
    }
    generateVeins() {
      // Reshape deposits after rooms and patrols exist, keeping each biome's loot budget.
      const bands=[[10,31],[32,61],[62,GATE_Y-1],[GATE_Y+2,123],[124,153],[154,HEIGHT-2]];
      const clueTiles=new Set(this.clues.map(c=>key(c.x,c.y)));
      for(let biome=0;biome<bands.length;biome++) {
        const [top,bottom]=bands[biome],pool=[];
        for(const [k,item] of this.items)if(item.type==='gem'&&item.y>=top&&item.y<=bottom){pool.push(item);this.items.delete(k);}
        const patrols=this.snakes.filter(s=>s.biome===biome);
        const deposit=(x,y)=>{
          if(!pool.length||x<2||x>WIDTH-3||y<top||y>bottom||this.items.has(key(x,y))||this.shortcuts.has(key(x,y))||clueTiles.has(key(x,y))||this.refugeAt({x,y}))return;
          const item=pool.pop();this.place(x,y,'gem',item.value);
          // A vein can be followed with the pick; surrounding rock still rewards drilling.
          if(this.grid[y][x]===2)this.grid[y][x]=1;
        };
        // Reserve a small pocket at every patrol before spending the rest on long seams.
        for(const snake of patrols)for(const p of snake.body.filter(p=>p.y>=top&&p.y<=bottom).slice(0,3))deposit(p.x,p.y);
        for(let attempt=0;pool.length&&patrols.length&&attempt<120;attempt++) {
          const snake=patrols[attempt%patrols.length],end=snake.body[Math.floor(this.random()*snake.body.length)];
          const side=this.random()<.5?-1:1;
          let x=Math.max(2,Math.min(WIDTH-3,end.x+side*(8+Math.floor(this.random()*7))));
          let y=Math.max(top,Math.min(bottom,end.y+(this.random()<.5?-1:1)*(3+Math.floor(this.random()*5))));
          const target={x:end.x,y:Math.max(top,Math.min(bottom,end.y))},path=[];
          while(x!==target.x||y!==target.y) {
            path.push({x,y});deposit(x,y);
            if(x!==target.x&&(y===target.y||this.random()<.7))x+=Math.sign(target.x-x);
            else y+=Math.sign(target.y-y);
          }
          deposit(x,y);
          // A fork midway offers one more detour while the main seam reaches the patrol.
          const fork=path[Math.floor(path.length/2)];
          if(fork){const direction=this.random()<.5?-1:1;for(let j=1;j<=4;j++)deposit(fork.x,fork.y+direction*j);}
          for(const d of DIRS)deposit(x+d.x,y+d.y);
        }
        // Crowded seeds use free original slots, then any remaining space in the biome.
        for(const item of [...pool])deposit(item.x,item.y);
        for(let y=top;pool.length&&y<=bottom;y++)for(let x=2;pool.length&&x<WIDTH-2;x++)deposit(x,y);
      }
    }
    generateNether() {
      // Small caves, denser stone, and wandering diggable routes beyond the seal.
      for(let n=0;n<35;n++)this.room(5+Math.floor(this.random()*48),100+Math.floor(this.random()*78),2+Math.floor(this.random()*3),2);
      for(let y=GATE_Y+1;y<HEIGHT-1;y++)for(let x=1;x<WIDTH-1;x++) {
        if(this.grid[y][x]===1&&this.random()<.24)this.grid[y][x]=2;
        if(this.random()<.035)this.place(x,y,'gem',4+Math.floor((y-GATE_Y)/30));
      }
      const names=['Korpsångens krona','Den namnlöses öga','Det sista andetaget'];
      let previous={x:GATE_X,y:GATE_Y+1};
      for(let i=0;i<3;i++) {
        const r={x:8+Math.floor(this.random()*42),y:112+i*28+Math.floor(this.random()*8),name:names[i],hidden:true};
        this.relics.push(r);
        // A crooked route guarantees a retreat without requiring a charged drill.
        let x=previous.x;
        for(let y=previous.y;y<=r.y;y++) {
          const aim=y===r.y?r.x:Math.max(4,Math.min(WIDTH-5,x+Math.floor(this.random()*13)-6));
          while(x!==aim){if(this.grid[y][x]===2)this.grid[y][x]=1;x+=Math.sign(aim-x);}
          if(this.grid[y][x]===2)this.grid[y][x]=1;
        }
        this.room(r.x,r.y,3,3);this.items.delete(key(r.x,r.y));this.place(r.x,r.y,'relic',i+3,{name:r.name});
        this.addSnake(r.x,r.y+3,19+i*3,i+3);
        previous=r;
      }
      for(const y of [105,109,115,133,137,143,162,166,174])this.addSnake(8+Math.floor(this.random()*41),y,17+Math.floor(this.random()*8),biomeAt(y));
      for(let i=0;i<7;i++) {
        const x=6+Math.floor(this.random()*46),y=106+i*11;
        this.horrors.push({x,y,stun:0,charge:0,rush:0,cooldown:2+this.random()*4,target:null});
      }
      for(let i=0;i<7;i++){const x=5+Math.floor(this.random()*48),y=102+i*11;this.open(x,y);this.place(x,y,'chest');}
      this.room(GATE_X,GATE_Y-3,5,3);this.room(GATE_X,GATE_Y+3,4,3);
      for(let y=83;y<GATE_Y;y++)if(this.grid[y][GATE_X]===2)this.grid[y][GATE_X]=1;
      // Written last: no cave, snake, or drill can bypass the magical boundary.
      for(let x=0;x<WIDTH;x++){this.grid[GATE_Y][x]=3;this.items.delete(key(x,GATE_Y));}
      this.grid[GATE_Y][GATE_X]=4;
      this.open(GATE_X,GATE_Y-1);this.open(GATE_X,GATE_Y+1);
      for(const y of [GATE_Y-2,GATE_Y+2]){this.items.delete(key(GATE_X,y));this.place(GATE_X,y,'chest');}
    }
    addSnake(cx,cy,length,biome) {
      const path=[];cx=Math.max(7,Math.min(WIDTH-8,cx));cy=Math.min(HEIGHT-5,cy);
      for(let x=cx-4;x<=cx+4;x++)path.push({x,y:cy-2});
      for(let y=cy-1;y<=cy+2;y++)path.push({x:cx+4,y});
      for(let x=cx+3;x>=cx-4;x--)path.push({x,y:cy+2});
      for(let y=cy+1;y>cy-2;y--)path.push({x:cx-4,y});
      path.forEach(p=>this.open(p.x,p.y));
      const body=path.slice(0,length).reverse();
      this.snakes.push({body,previous:body.map(p=>({...p})),biome,nether:biome>=3,stun:0,timer:this.random()*.25,interval:.29,alert:false,dir:1,notice:0,memory:null,memoryUntil:0,mode:'patrol'});
    }
    start() {this.state='playing';}
    pause() {if(this.state==='playing'){this.state='paused';this.player.drilling=0;}}
    resume() {if(this.state==='paused')this.state='playing';}
    sight() {return (this.player.y>GATE_Y?6:10)+(this.perks.has('lantern')?3:0);}
    reveal(radius=this.sight()) {
      const p=this.player;
      for(let y=Math.max(0,p.y-radius);y<=Math.min(HEIGHT-1,p.y+radius);y++)for(let x=Math.max(0,p.x-radius);x<=Math.min(WIDTH-1,p.x+radius);x++)if((this.gate.open||y<=GATE_Y)&&(x-p.x)**2+(y-p.y)**2<=radius**2)this.seen[key(x,y)]=1;
      for(const r of this.relics)if(r.hidden&&!r.discovered&&this.seen[key(r.x,r.y)]){r.discovered=true;this.emit('discovery',{name:r.name});}
    }
    target() {
      const upper=this.relics.slice(0,3).find(r=>!r.taken);if(upper)return upper;
      if(this.player.relics===6)return this.player.y>GATE_Y?{...this.gate,name:'Nattporten'}:{x:29,y:SURFACE,name:'Baslägret'};
      if(this.player.y<=GATE_Y)return {...this.gate,name:'Nattporten'};
      return this.relics.find(r=>r.hidden&&r.discovered&&!r.taken)||null;
    }
    makeNoise(x,y,duration) {this.noise=Math.max(this.noise,duration);this.noiseSource={x,y};}
    drill() {
      const p=this.player;if(this.state!=='playing'||p.drillCooldown>0)return false;
      p.drilling=6;p.drillCooldown=Math.max(2.4,7-this.upgrades.boots)* (this.perks.has('drill')?.5:1);p.invincible=Math.max(p.invincible,1);this.moveTimer=0;this.makeNoise(p.x,p.y,3);
      this.emit('drill');return true;
    }
    flare() {
      const p=this.player;if(this.state!=='playing'||p.flares<1)return false;
      p.flares--;const radius=this.perks.has('flares')?9:6;
      this.flares.push({x:p.x,y:p.y,life:9,radius});this.emit('flare',{x:p.x,y:p.y});
      this.snakes.forEach(s=>{if(s.body.some(b=>distance(b,p)<radius))s.stun=s.nether?2.5:5;});
      this.horrors.forEach(h=>{if(distance(h,p)<radius){h.stun=3;h.charge=0;h.rush=0;h.target=null;}});return true;
    }
    damage(amount=1,source='snake') {
      const p=this.player;if(p.invincible>0||this.state!=='playing')return;
      p.hp=Math.max(0,p.hp-(this.perks.has('ward')?1:amount));p.invincible=this.perks.has('ward')?3.4:2.4;this.combo=0;this.comboTimer=0;this.emit('hurt',{source});
      if(p.hp<=0)this.finish(false);
    }
    collision() {
      const p=this.player;if(p.invincible>0||p.y<=SURFACE+2||this.refugeAt(p))return;
      const snake=this.snakes.find(s=>s.stun<=0&&s.body.some(b=>b.x===p.x&&b.y===p.y));
      if(snake)this.damage(snake.nether?2:1);
      if(p.y>GATE_Y&&this.horrors.some(h=>h.stun<=0&&h.charge<=0&&distance(h,p)<.85))this.damage(2,'horror');
    }
    collect(item) {
      if(!item)return;this.items.delete(key(item.x,item.y));const p=this.player;
      if(item.type==='gem') {
        const previousMultiplier=this.comboTimer>0?Math.min(4,1+Math.floor(this.combo/5)):1;
        this.combo=this.comboTimer>0?this.combo+1:1;this.comboTimer=4;this.maxCombo=Math.max(this.maxCombo,this.combo);
        const multiplier=Math.min(4,1+Math.floor(this.combo/5));const amount=item.value*multiplier*(this.perks.has('rich')?2:1);
        p.bag+=amount;this.emit('gem',{x:item.x,y:item.y,amount,multiplier,combo:this.combo,milestone:multiplier>previousMultiplier});
      } else if(item.type==='chest') {
        const amount=5+biomeAt(item.y)*5,supply=this.perks.has('supplies')?2:1;p.bag+=amount;p.flares=Math.min(12,p.flares+supply);p.hp=Math.min(p.maxHp,p.hp+supply);
        this.emit('chest',{x:item.x,y:item.y,amount,supply});
      } else if(item.type==='relic') {
        const relic=this.relics[item.value];if(!relic||relic.taken)return;
        relic.taken=true;p.relics++;const amount=item.value>=3?90:30;p.bag+=amount;p.hp=Math.min(p.maxHp,p.hp+2);p.invincible=3;
        if(!this.gate.open&&this.relics.slice(0,3).every(r=>r.taken)){
          this.gate.open=true;this.grid[GATE_Y][GATE_X]=0;this.emit('gate');
        }
        this.reveal(item.value>=3?9:18);this.makeNoise(item.x,item.y,6);
        const available=PERKS.filter(v=>!this.perks.has(v.id));
        this.choices=[];while(this.choices.length<3&&available.length){this.choices.push(available.splice(Math.floor(this.random()*available.length),1)[0]);}
        this.state='choice';p.drilling=0;this.emit('relic',{name:item.name,index:item.value,amount});
      }
    }
    choose(id) {
      if(this.state!=='choice'||!this.choices.some(p=>p.id===id))return false;
      this.perks.add(id);const p=this.player;
      if(id==='heart'){p.maxHp+=2;p.hp=p.maxHp;}
      if(id==='flares')p.flares=Math.min(12,p.flares+4);
      if(id==='supplies'){p.flares=Math.min(12,p.flares+3);p.hp=p.maxHp;}
      if(id==='lantern')this.reveal();
      this.choices=[];this.state='playing';this.emit('perk',{id});return true;
    }
    step(dir) {
      if(this.state!=='playing')return false;
      const p=this.player;const d=DIRS[dir],x=p.x+d.x,y=p.y+d.y;p.dir=dir;
      if(x<1||x>=WIDTH-1||y<SURFACE||y>=HEIGHT-1)return false;
      if(this.grid[y][x]>=3){this.emit('sealed',{gate:x===GATE_X});return false;}
      if(this.grid[y][x]===2&&!p.drilling){this.emit('rock');return false;}
      if(this.grid[y][x]!==0){const rock=this.grid[y][x]===2;this.grid[y][x]=0;if(p.drilling||!this.perks.has('quiet'))this.makeNoise(x,y,p.drilling?3:1.2);this.emit('dig',{x,y,dir,rock,drill:p.drilling>0});}
      p.oldX=p.x;p.oldY=p.y;p.x=x;p.y=y;p.blend=0;this.deepest=Math.max(this.deepest,(y-SURFACE)*2);
      if(p.drilling){p.drilling--;this.snakes.forEach(s=>{if(s.body.some(b=>distance(b,p)<2))s.stun=s.nether?1.8:3;});this.horrors.forEach(h=>{if(distance(h,p)<2){h.stun=5;h.charge=0;h.rush=0;h.target=null;}});}
      if(y>GATE_Y&&!this.enteredNether){this.enteredNether=true;this.emit('nether');}
      this.collect(this.items.get(key(x,y)));
      if(this.perks.has('magnet'))for(const item of this.items.values())if(item.type==='gem'&&distance(item,p)<=2.5)this.collect(item);
      this.reveal();this.collision();const b=biomeAt(y);if(b!==this.lastBiome){this.lastBiome=b;this.emit('biome',{name:BIOMES[b].name,index:b});}
      const refuge=this.refugeAt(p);
      if(refuge&&!refuge.visited){refuge.visited=true;this.emit('refuge',{name:refuge.name});}
      const clue=this.nearbyClue();
      if(clue&&!refuge&&!this.relics[clue.relic].trailFound){this.relics[clue.relic].trailFound=true;this.emit('trail',{index:clue.relic-3});}
      if(!this.tacticsExplained&&this.encounters.some(e=>distance(e,p)<3)){this.tacticsExplained=true;this.emit('tactics');}
      if(y===SURFACE&&p.relics===6)this.finish(true);
      return true;
    }
    clearSight(a,b) {
      const steps=Math.ceil(distance(a,b)*2);
      for(let i=1;i<=steps;i++){const x=Math.round(a.x+(b.x-a.x)*i/steps),y=Math.round(a.y+(b.y-a.y)*i/steps);if(this.grid[y]?.[x]!==0)return false;}
      return true;
    }
    snakeStep(s) {
      const head=s.body[0],neck=s.body[1],p=this.player;
      let target=null;
      const fire=this.flares.find(f=>distance(f,head)<f.radius+6);
      if(fire){target=fire;s.memory=null;s.alert=false;s.notice=0;s.mode='lured';
        if(distance(fire,head)<fire.radius){s.stun=s.nether?2:4;return;}
      } else {
        const safe=p.y<=SURFACE+2||!!this.refugeAt(p),source=this.noiseSource||p;
        const sees=!safe&&distance(head,p)<(s.nether?8:6)+(p.relics>=3?2:0)&&this.clearSight(head,p);
        const hears=!safe&&this.noise>0&&distance(head,source)<(s.nether?18:13)+(p.relics>=3?4:0);
        if(sees||hears){
          const point=sees?p:source;
          if(!s.alert){s.notice=s.nether?.5:.7;this.emit('snake-notice',{x:head.x,y:head.y});}
          s.memory={x:point.x,y:point.y};s.memoryUntil=this.time+(s.nether?4.5:3);
        }
        if(safe||this.time>=(s.memoryUntil||0))s.memory=null;
        target=s.memory;s.alert=!!target;s.mode=sees?'hunt':target?'search':'patrol';
        if(s.notice>0){s.previous=s.body.map(b=>({...b}));return;}
        if(target&&distance(head,target)<.5){s.memory=null;target=null;s.alert=false;s.mode='patrol';}
      }
      const valid=DIRS.map((d,i)=>({x:head.x+d.x,y:head.y+d.y,dir:i})).filter(n=>n.y>SURFACE+2&&n.y<HEIGHT-1&&n.x>0&&n.x<WIDTH-1&&this.grid[n.y][n.x]===0&&!this.refugeAt(n)&&!(n.x===neck.x&&n.y===neck.y));
      if(!valid.length){s.previous=s.body.map(b=>({...b}));s.body.reverse();return;}
      let next;
      if(target) {
        // Bounded breadth-first search follows actual tunnels, including those you dig.
        const queue=[{x:head.x,y:head.y,first:null}],visited=new Set([key(head.x,head.y)]);let best=null,bestDistance=distance(head,target);
        for(let q=0;q<queue.length&&q<420;q++) {
          const node=queue[q];if(node.first&&distance(node,target)<bestDistance){bestDistance=distance(node,target);best=node.first;}
          if(node.x===target.x&&node.y===target.y){best=node.first;break;}
          for(let i=0;i<4;i++){const d=DIRS[i],x=node.x+d.x,y=node.y+d.y,k=key(x,y);if(x<1||x>=WIDTH-1||y<=SURFACE+2||y>=HEIGHT-1||this.grid[y][x]!==0||visited.has(k)||this.refugeAt({x,y}))continue;
            if(q===0&&!valid.some(v=>v.x===x&&v.y===y))continue;visited.add(k);queue.push({x,y,first:node.first||{x,y,dir:i}});}
        }
        next=best;
      }
      if(!next){const free=valid.filter(n=>!s.body.slice(0,-2).some(b=>b.x===n.x&&b.y===n.y));const pool=free.length?free:valid;next=pool.find(n=>n.dir===s.dir&&this.random()<.7)||pool[Math.floor(this.random()*pool.length)];}
      s.previous=s.body.map(b=>({...b}));s.body.unshift({x:next.x,y:next.y});s.body.pop();s.dir=next.dir;
    }
    horrorStep(h,dt) {
      if(!this.gate.open||this.player.y<=GATE_Y)return;
      const p=this.player,fire=this.flares.find(f=>distance(f,h)<f.radius);
      h.stun=Math.max(0,h.stun-dt);h.cooldown=Math.max(0,h.cooldown-dt);
      if(this.refugeAt(p)){h.charge=0;h.rush=0;h.target=null;h.cooldown=Math.max(h.cooldown,2);return;}
      const old={x:h.x,y:h.y};
      if(fire) {
        h.charge=0;h.rush=0;h.target=null;h.stun=Math.max(h.stun,1);h.cooldown=Math.max(h.cooldown,2);
        const d=Math.max(.1,distance(h,fire));h.x+=(h.x-fire.x)/d*dt*2;h.y+=(h.y-fire.y)/d*dt*2;
      } else if(h.stun<=0) {
        if(h.charge>0){h.charge=Math.max(0,h.charge-dt);if(h.charge===0)h.rush=1.8;}
        else if(h.rush>0&&h.target) {
          h.rush=Math.max(0,h.rush-dt);const d=distance(h,h.target),step=Math.min(d,dt*6);
          if(d>.05){h.x+=(h.target.x-h.x)/d*step;h.y+=(h.target.y-h.y)/d*step;}
          if(d<.2||h.rush===0){h.rush=0;h.target=null;h.cooldown=4.5;}
        } else if(distance(h,p)<14) {
          if(h.cooldown===0&&distance(h,p)<10){h.target={x:p.x,y:p.y};h.charge=1.5;this.emit('whisper');}
          else {const d=Math.max(.1,distance(h,p)),speed=.5+Math.max(0,p.relics-3)*.15;h.x+=(p.x-h.x)/d*dt*speed;h.y+=(p.y-h.y)/d*dt*speed;}
        }
      }
      h.x=Math.max(1,Math.min(WIDTH-2,h.x));h.y=Math.max(GATE_Y+2,Math.min(HEIGHT-2,h.y));
      if(this.refugeAt(h)){h.x=old.x;h.y=old.y;h.charge=0;h.rush=0;h.target=null;h.cooldown=2;}
    }
    update(dt,dir=null) {
      if(this.state!=='playing')return;dt=Math.min(.05,Math.max(0,dt));this.time+=dt;const p=this.player;
      p.invincible=Math.max(0,p.invincible-dt);p.drillCooldown=Math.max(0,p.drillCooldown-dt);this.noise=Math.max(0,this.noise-dt);this.comboTimer=Math.max(0,this.comboTimer-dt);
      if(this.comboTimer===0)this.combo=0;
      p.blend=Math.min(1,p.blend+dt/(p.drilling?.045:.105));
      this.moveTimer=Math.max(0,this.moveTimer-dt);
      if((dir!==null||p.drilling)&&this.moveTimer<=0) {
        const direction=p.drilling?p.dir:dir;
        const d=DIRS[direction],digging=this.grid[p.y+d.y]?.[p.x+d.x]!==0;
        this.moveTimer=p.drilling?.045:(digging?.16:.115)*(1-this.upgrades.pick*.12)*(this.perks.has('quiet')?.78:1);
        if(!this.step(direction))p.drilling=0;
      }
      if(this.state!=='playing')return;
      for(const f of this.flares)f.life-=dt;this.flares=this.flares.filter(f=>f.life>0);
      for(const s of this.snakes) {
        s.notice=Math.max(0,(s.notice||0)-dt);s.stun=Math.max(0,s.stun-dt);if(s.stun>0)continue;
        s.interval=(s.nether?(s.alert?.175:.25):(s.alert?.21:.30))-(p.relics>=3?.025:0)-Math.max(0,p.relics-3)*.005;s.timer+=dt;
        if(s.timer>=s.interval){s.timer=0;this.snakeStep(s);}
      }
      for(const h of this.horrors)this.horrorStep(h,dt);
      this.threat=!this.refugeAt(p)&&(this.snakes.some(s=>s.alert&&s.stun<=0&&distance(s.body[0],p)<12)||this.horrors.some(h=>p.y>GATE_Y&&h.stun<=0&&distance(h,p)<10));this.collision();
    }
    finish(escaped) {
      if(this.result)return;const p=this.player;
      if(escaped&&p.y>SURFACE)return;
      this.result={escaped,complete:escaped&&p.relics===6,upperComplete:escaped&&p.relics>=3,haul:p.bag,earned:escaped?p.bag:Math.floor(p.bag*.25),relics:p.relics,depth:this.deepest,combo:this.maxCombo,seconds:Math.floor(this.time)};
      this.state='ended';p.drilling=0;this.emit('end',this.result);
    }
  }
  const api={Game,WIDTH,HEIGHT,SURFACE,GATE_X,GATE_Y,DIRS,BIOMES,PERKS,UPGRADES,TRAILS,biomeAt,key,rng};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DeepBelow=api;
})(typeof globalThis!=='undefined'?globalThis:this);
