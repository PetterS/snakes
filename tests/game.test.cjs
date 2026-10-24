'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Game, WIDTH, HEIGHT, SURFACE, DIRS, key} = require('../engine.js');

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
      if(x<1||x>=WIDTH-1||y<SURFACE||y>=HEIGHT-1||game.grid[y][x]===2||visited.has(k))return;
      visited.set(k,{previous:key(p.x,p.y),dir});queue.push({x,y});
    });
  }
  return null;
}

test('100 procedural caves have reachable relics, safe starts, and valid snake bodies',()=>{
  for(let seed=1;seed<=100;seed++) {
    const game=new Game(seed);
    assert.equal(game.relics.length,3);
    for(const relic of game.relics) {
      assert.ok(route(game,game.player,relic),`seed ${seed}: unreachable relic`);
      assert.equal(game.items.get(key(relic.x,relic.y)).type,'relic');
    }
    for(const snake of game.snakes)for(const p of snake.body){assert.equal(game.grid[p.y][p.x],0);assert.ok(p.y>SURFACE+2);}
    assert.equal(game.player.hp,5);
  }
});

test('three relic choices and return to the surface complete an expedition exactly once',()=>{
  const game=new Game(1024);game.start();game.player.invincible=1000;
  for(const relic of game.relics) {
    for(const dir of route(game,game.player,relic))game.step(dir);
    assert.equal(game.state,'choice');assert.equal(game.choices.length,3);
    const chosen=game.choices[0].id;assert.ok(game.choose(chosen));assert.ok(game.perks.has(chosen));
  }
  for(const dir of route(game,game.player,{x:29,y:SURFACE}))game.step(dir);
  assert.equal(game.state,'ended');assert.ok(game.result.complete);assert.equal(game.result.earned,game.player.bag);
  game.finish(true);assert.equal(game.drainEvents().filter(e=>e.type==='end').length,1);
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
