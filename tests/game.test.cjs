'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Game, WIDTH, HEIGHT, SURFACE, GATE_X, GATE_Y, DIRS, key} = require('../engine.js');

function route(game, start, target) {
  const queue=[start], visited=new Map([[key(start.x,start.y),null]]);
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];
    if(p.x===target.x&&p.y===target.y) {
      const result=[];let k=key(p.x,p.y);
      while(visited.get(k)){const entry=visited.get(k);result.unshift(entry.dir);k=entry.previous;}
      return result;
    }
    DIRS.forEach((d,dir)=>{
      const x=p.x+d.x,y=p.y+d.y,k=key(x,y);
      if(x<1||x>=WIDTH-1||y<SURFACE||y>=HEIGHT-1||game.grid[y][x]>=2||visited.has(k))return;
      visited.set(k,{previous:key(p.x,p.y),dir});queue.push({x,y});
    });
  }
  return null;
}

function takeRelic(game,relic) {
  game.collect(game.items.get(key(relic.x,relic.y)));
  assert.equal(game.state,'choice');assert.equal(game.choices.length,3);
  assert.ok(game.choose(game.choices[0].id));
}

test('100 worlds seal off the netherworld, then allow all six relics and the return route',()=>{
  for(let seed=1;seed<=100;seed++) {
    const game=new Game(seed);game.start();
    assert.equal(game.relics.length,6);
    for(const relic of game.relics.slice(0,3)) {
      assert.ok(route(game,game.player,relic),`seed ${seed}: unreachable relic`);
      assert.equal(game.items.get(key(relic.x,relic.y)).type,'relic');
    }
    for(const snake of game.snakes)for(const p of snake.body){assert.equal(game.grid[p.y][p.x],0);assert.ok(p.y>SURFACE+2);}
    assert.equal(game.player.hp,5);
    assert.equal(route(game,game.player,game.relics[3]),null,`seed ${seed}: bypassed seal`);
    assert.ok(route(game,game.player,{x:GATE_X,y:GATE_Y-1}));
    for(const r of game.relics.slice(0,3))takeRelic(game,r);
    assert.ok(game.gate.open);
    for(const r of game.relics.slice(3)) {
      assert.ok(route(game,game.player,r),`seed ${seed}: unreachable nether relic`);
      assert.ok(route(game,r,{x:29,y:SURFACE}),`seed ${seed}: no escape`);
      assert.equal(game.items.get(key(r.x,r.y)).type,'relic');
      assert.equal(r.discovered,undefined);
    }
  }
});

test('six relic choices, crossing the gate both ways, and returning complete an expedition once',()=>{
  const game=new Game(1024);game.start();game.player.invincible=1000;
  for(const relic of game.relics) {
    for(const dir of route(game,game.player,relic))game.step(dir);
    assert.equal(game.state,'choice');assert.equal(game.choices.length,3);
    const chosen=game.choices[0].id;assert.ok(game.choose(chosen));assert.ok(game.perks.has(chosen));
    if(game.player.relics===3){assert.ok(game.gate.open);assert.equal(game.result,null);}
  }
  assert.equal(game.target().name,'Nattporten');
  for(const dir of route(game,game.player,{x:29,y:SURFACE}))game.step(dir);
  assert.equal(game.target().name,'Baslägret');
  assert.equal(game.state,'ended');assert.ok(game.result.complete);assert.ok(game.enteredNether);assert.equal(game.player.relics,6);assert.equal(game.result.earned,game.player.bag);
  game.finish(true);assert.equal(game.drainEvents().filter(e=>e.type==='end').length,1);
});

test('the magic seal resists drilling everywhere and opens only after the three upper relics',()=>{
  const game=new Game(45);game.start();game.snakes=[];
  for(let x=1;x<WIDTH-1;x++) {
    Object.assign(game.player,{x,y:GATE_Y-1,dir:2,drilling:6});
    assert.equal(game.step(2),false);assert.equal(game.player.y,GATE_Y-1);assert.ok(game.grid[GATE_Y][x]>=3);
  }
  for(const r of [game.relics[2],game.relics[0]]){takeRelic(game,r);assert.equal(game.gate.open,false);}
  takeRelic(game,game.relics[1]);assert.ok(game.gate.open);
  Object.assign(game.player,{x:GATE_X,y:GATE_Y-1,drilling:0});
  assert.ok(game.step(2));assert.ok(game.step(2));assert.equal(game.enteredNether,true);
  assert.ok(game.step(0));assert.ok(game.step(0));
  Object.assign(game.player,{x:GATE_X-1,y:GATE_Y-1,drilling:6});assert.equal(game.step(2),false);
  assert.equal(game.drainEvents().filter(e=>e.type==='gate').length,1);
});

test('hidden relics have no compass location until discovered and nether rewards are larger',()=>{
  const game=new Game(77);game.start();
  for(const r of game.relics.slice(0,3))takeRelic(game,r);
  assert.equal(game.target().name,'Nattporten');
  Object.assign(game.player,{x:GATE_X,y:GATE_Y+2});game.reveal();
  assert.equal(game.target(),null);assert.equal(game.sight(),6);
  const r=game.relics[3];Object.assign(game.player,{x:r.x,y:r.y-3});game.reveal();
  assert.ok(r.discovered);assert.equal(game.target(),r);
  const before=game.player.bag;takeRelic(game,r);assert.equal(game.player.bag,before+90);
  assert.equal(game.target(),null);
});

test('returning with three or four relics allows voluntary banking without a full victory',()=>{
  for(const count of [3,4]) {
    const game=new Game(15);game.start();game.snakes=[];game.horrors=[];
    for(const r of game.relics.slice(0,count))takeRelic(game,r);
    Object.assign(game.player,{x:29,y:SURFACE+1});assert.ok(game.step(0));
    assert.equal(game.state,'playing');assert.equal(game.result,null);
    game.finish(true);assert.ok(game.result.escaped);assert.ok(game.result.upperComplete);assert.equal(game.result.complete,false);
    assert.equal(game.result.earned,game.player.bag);
  }
});

test('drill breaks rock, stuns a snake, honors cooldown, and respects borders',()=>{
  const game=new Game(5);game.start();const p=game.player;p.y=12;p.oldY=12;p.dir=1;
  for(let x=p.x+1;x<=p.x+6;x++)game.grid[p.y][x]=2;
  game.snakes=[{body:[{x:p.x+2,y:p.y},{x:p.x+3,y:p.y}],previous:[{x:p.x+2,y:p.y},{x:p.x+3,y:p.y}],timer:0,interval:.3,stun:0,dir:1}];
  const hp=p.hp;assert.equal(game.step(1),false);assert.equal(game.drill(),true);assert.equal(game.drill(),false);
  for(let i=0;i<20;i++)game.update(.05);
  assert.equal(p.x,35);assert.equal(p.hp,hp);assert.ok(game.snakes[0].stun>0);assert.equal(game.grid[12][30],0);
  p.x=WIDTH-2;p.dir=1;p.drillCooldown=0;game.drill();game.update(.05);assert.equal(p.x,WIDTH-2);
});

test('flare stuns immediately, costs one charge, and is inert when paused or empty',()=>{
  const game=new Game(42);game.start();const s=game.snakes[0];game.player.x=s.body[0].x;game.player.y=s.body[0].y;
  const before=game.player.flares;assert.ok(game.flare());assert.equal(game.player.flares,before-1);assert.ok(s.stun>0);
  game.collision();assert.equal(game.player.hp,5);
  game.pause();assert.equal(game.flare(),false);assert.equal(game.drill(),false);
  const time=game.time;game.update(.05,2);assert.equal(game.time,time);
  game.resume();game.player.flares=0;assert.equal(game.flare(),false);
});

test('snakes investigate freshly dug tunnels and stay underground',()=>{
  const game=new Game(12);game.start();
  game.grid=Array.from({length:HEIGHT},()=>Array(WIDTH).fill(1));
  for(let x=10;x<=35;x++)game.grid[12][x]=0;
  const snake={body:[{x:20,y:12},{x:19,y:12},{x:18,y:12}],previous:[],dir:1,stun:0,timer:0,interval:.3};
  game.player.x=28;game.player.y=12;game.noise=2;game.snakes=[snake];game.snakeStep(snake);
  assert.equal(snake.body[0].x,21);assert.equal(snake.alert,true);
  game.player.invincible=1000;
  for(let i=0;i<4000;i++)game.update(.05);
  for(const p of snake.body){assert.equal(game.grid[p.y][p.x],0);assert.ok(p.y>SURFACE+2);}
});

test('damage grace period, rescue payout, early banking, and gem combos',()=>{
  const game=new Game(7);game.start();
  for(let i=0;i<6;i++)game.collect({type:'gem',value:2,x:3+i,y:6});
  assert.equal(game.player.bag,16);assert.equal(game.combo,6);
  game.damage();game.damage();assert.equal(game.player.hp,4);
  game.player.hp=1;game.player.invincible=0;game.damage();assert.equal(game.state,'ended');assert.equal(game.result.earned,4);
  const early=new Game(8);early.start();early.player.bag=60;early.player.y=9;early.finish(true);assert.equal(early.result,null);
  early.player.y=SURFACE;early.finish(true);assert.equal(early.result.earned,60);assert.equal(early.result.complete,false);
});

test('persistent upgrades and chosen powers affect the next expedition',()=>{
  const game=new Game(9,{armor:3,boots:3,pick:3});assert.equal(game.player.hp,8);game.start();game.drill();assert.equal(game.player.drillCooldown,4);
  game.state='choice';game.choices=[{id:'heart'}];game.player.hp=1;assert.equal(game.choose('invalid'),false);game.choose('heart');assert.equal(game.player.hp,10);
  game.state='choice';game.choices=[{id:'flares'}];game.choose('flares');assert.equal(game.player.flares,7);
});

test('nether snakes hit harder, move faster, and recover sooner from flares',()=>{
  const game=new Game(88);game.start();const normal=game.snakes.find(s=>!s.nether),deadly=game.snakes.find(s=>s.nether);
  game.player.x=deadly.body[0].x;game.player.y=deadly.body[0].y;game.horrors=[];
  game.collision();assert.equal(game.player.hp,3);game.collision();assert.equal(game.player.hp,3);
  game.player.invincible=0;game.perks.add('ward');game.collision();assert.equal(game.player.hp,2);assert.equal(game.player.invincible,3.4);
  game.flare();assert.equal(deadly.stun,2.5);
  game.player.x=normal.body[0].x;game.player.y=normal.body[0].y;game.flare();assert.equal(normal.stun,5);
  game.flares=[];normal.stun=0;deadly.stun=0;normal.timer=0;deadly.timer=0;normal.alert=true;deadly.alert=true;
  game.update(.01);assert.ok(deadly.interval<normal.interval);
});

test('horrors warn before rushing through walls, can be dodged, and cannot leave the netherworld',()=>{
  const game=new Game(91);game.start();game.snakes=[];game.gate.open=true;
  Object.assign(game.player,{x:25,y:110});
  const h={x:20,y:110,stun:0,charge:0,rush:0,cooldown:0,target:null};game.horrors=[h];
  for(let x=20;x<=25;x++)game.grid[110][x]=2;
  game.horrorStep(h,.05);assert.ok(h.charge>1);assert.deepEqual(h.target,{x:25,y:110});
  const start=h.x;for(let i=0;i<20;i++)game.horrorStep(h,.05);assert.equal(h.x,start);
  game.player.y=113;
  for(let i=0;i<40;i++){game.horrorStep(h,.05);game.collision();}
  assert.ok(h.x>24);assert.equal(game.player.hp,5);assert.equal(game.grid[110][23],2);
  h.x=game.player.x;h.y=game.player.y;h.charge=0;h.stun=0;game.collision();assert.equal(game.player.hp,3);
  h.y=GATE_Y+2;game.player.y=GATE_Y+1;h.charge=0;h.rush=1;h.target={x:h.x,y:GATE_Y-5};
  for(let i=0;i<50;i++)game.horrorStep(h,.05);assert.ok(h.y>GATE_Y);
  game.player.y=SURFACE;const before={x:h.x,y:h.y};game.horrorStep(h,.05);assert.equal(h.x,before.x);assert.equal(h.y,before.y);
});

test('flares interrupt and repel horrors; a drill safely banishes nearby horrors',()=>{
  const game=new Game(92);game.start();game.snakes=[];game.gate.open=true;
  Object.assign(game.player,{x:25,y:110,dir:1});
  const h={x:27,y:110,stun:0,charge:1,rush:0,cooldown:0,target:{x:25,y:110}};game.horrors=[h];
  assert.ok(game.flare());assert.equal(h.charge,0);assert.equal(h.target,null);assert.ok(h.stun>0);
  game.horrorStep(h,.05);assert.ok(h.x>27);assert.equal(game.player.flares,2);
  game.flares=[];Object.assign(h,{x:26,y:110,stun:0,charge:0});game.grid[110][26]=2;
  game.drill();game.step(1);assert.equal(game.player.hp,5);assert.equal(h.stun,5);
});

test('new survival powers reveal further and replenish supplies without exceeding limits',()=>{
  const game=new Game(93);game.start();game.gate.open=true;game.player.y=110;
  game.state='choice';game.choices=[{id:'lantern'}];game.choose('lantern');assert.equal(game.sight(),9);
  game.player.hp=1;game.player.flares=11;game.state='choice';game.choices=[{id:'supplies'}];game.choose('supplies');
  assert.equal(game.player.hp,5);assert.equal(game.player.flares,12);
  game.player.hp=1;game.player.flares=1;game.collect({x:20,y:110,type:'chest'});
  assert.equal(game.player.hp,3);assert.equal(game.player.flares,3);
});
