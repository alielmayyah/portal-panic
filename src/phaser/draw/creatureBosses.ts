import { type G, INK, dashed, glowOval, line, oval, rect } from './prims';
import { ink, stroke } from './creatureInk';
import type { MobView } from './enemies';
import type { ObstacleView } from './view';

function bossEye(g: G, x: number, y: number, size: number, color: string, asleep: boolean): void {
  g.save();
  g.translateCanvas(x, y);
  g.scaleCanvas(size, size);
  if (asleep) stroke(g, INK, 2.2, '-7 0/0 5 7 -1');
  else {
    ink(g, color, '-8 -1/-4 -7 2 -6/7 -6 8 -2/5 6 -2 5/-6 5 -8 -1', 1.6);
    oval(g,-2,-.6,1.9,4.25,INK,undefined,0,.14);
    oval(g,-3.6,-2.5,1.15,1,'#fff4d5');
  }
  g.restore();
}

// Gulvax wears a beetle carapace and carries its brood in amber blisters.
function drawWarden(g: G, state: string, phase: number, t: number): void {
  const breathe = Math.sin(t * .065);
  const stride = state === 'dash' ? Math.sin(t * .44) : breathe * .18;
  for (const side of [-1,1]) {
    g.save();
    g.translateCanvas(side * 21, -23);
    g.rotateCanvas(side * stride * .2);
    ink(g, '#88495a', '-6 -8/5 -8/11 -1/7 8/5 12/11 15/10 21/1 21/-3 18/-9 20/-12 17/-9 10/-7 5/-10 -1', 2.2);
    ink(g, '#ecc398', '-9 16/-5 13 -2 15/-4 21/-11 21', 1.25);
    g.restore();
  }
  g.translateCanvas(0,breathe * 1.5);
  // Folded pincer on the far side.
  ink(g, '#98617b', '-17 -67/-31 -69 -39 -54/-50 -53 -47 -39/-46 -33 -43 -32/-40 -44 -36 -44/-37 -37 -34 -33/-27 -37 -30 -48/-17 -48 -13 -58', 2.3);
  ink(g, '#bd7273', '-31 -61/-21 -83 -1 -87/22 -91 38 -69/48 -54 41 -37/36 -20 20 -14/4 -6 -15 -14/-29 -20 -31 -36/-38 -49 -31 -61', 2.5);
  ink(g, '#88445f', '-30 -37/-17 -20 -2 -22/24 -21 37 -47/46 -53 43 -60/46 -40 34 -26/17 -6 -5 -12/-23 -13 -29 -27', 0);
  for (const [x,y,rx] of [[-3,-28,8],[12,-32,8.5],[23,-42,7],[29,-54,5]]) {
    oval(g,x,y,rx,rx*1.18,'#db977b',INK,1.2,-.24);
    oval(g,x-1,y+1,rx*.52,rx*.6,'#9e5c69');
    oval(g,x-rx*.3,y-rx*.45,rx*.28,rx*.17,'#ffe4a7');
  }
  // Upper shell and long hooked pronotum.
  ink(g, '#6a4869', '-35 -59/-38 -73 -25 -84/-17 -94 -4 -94/-10 -102 -6 -108/-1 -101 6 -101/17 -101 25 -89/39 -83 43 -69/48 -58 45 -48/39 -53 36 -56/34 -44 28 -40/24 -54 18 -55/12 -44 5 -40/4 -56 -6 -58/-14 -61 -21 -56/-22 -67 -35 -59', 2.4);
  ink(g, '#ae6684', '-30 -73/-22 -88 -5 -89/2 -96 10 -94/22 -90 26 -78/13 -84 3 -79/-9 -82 -15 -75/-23 -76 -30 -73', 0);
  stroke(g, '#e5a5a3', 1.6, '-25 -80/-16 -89 -7 -87');
  stroke(g, '#413345', 1.6, '11 -87/24 -77 26 -62');
  stroke(g, '#413345', 1.5, '24 -83/38 -72 39 -61');
  // An armored mask, a serrated jaw and two uneven mandibles.
  ink(g, '#e2ab8d', '-33 -67/-29 -77 -16 -76/-6 -81 3 -71/9 -63 5 -53/3 -46 -5 -43/-5 -34 -13 -29/-14 -38 -18 -39/-22 -31 -30 -32/-26 -38 -28 -42/-39 -46 -38 -56');
  ink(g, '#ab716e', '-36 -53/-27 -47 -19 -51/-11 -55 -6 -52/0 -54 4 -61/6 -51 -4 -46/-6 -38 -11 -34/-11 -43 -17 -44/-24 -40 -26 -37/-24 -43 -28 -45/-33 -46 -36 -53',0);
  bossEye(g,-25,-61,.78,'#ffd375',state === 'sleep');
  bossEye(g,-10,-64,1.04,'#ffd375',state === 'sleep');
  ink(g, '#b8757a', '-37 -64/-34 -72 -28 -72/-23 -70 -20 -67/-12 -75 -3 -72/-1 -70 0 -66/-10 -70 -17 -62/-21 -57 -24 -64/-29 -67 -37 -64',1.45);
  const mouth = state === 'volley' || state === 'summon';
  ink(g, '#4e3647', mouth ? '-32 -46/-23 -55 -10 -52/-8 -47 -13 -41/-25 -35 -32 -46' : '-31 -47/-21 -51 -11 -50/-16 -45 -21 -45/-27 -44 -31 -47',1.15);
  ink(g,'#fff1bd','-29 -48/-24 -49/-26 -44',.8);
  ink(g,'#fff1bd','-18 -50/-13 -51/-16 -46',.8);
  // Forelimb sickle. Negative space inside the claw keeps its profile legible.
  ink(g,'#965b73','20 -64/34 -70 40 -56/47 -52 45 -42/40 -37 38 -33/32 -28 26 -34/20 -40 24 -48/16 -54 20 -64',2.15);
  ink(g,'#dad1af','35 -40/44 -48 46 -58/53 -45 44 -34/36 -25 26 -22/30 -29 30 -33/24 -29 19 -30/23 -36 28 -38',1.85);
  stroke(g,'#faf1c4',1.55,'34 -33/43 -39 45 -46');
  if (phase > 1) {
    stroke(g,'#ffac80',2,'6 -91/9 -84/6 -78/13 -72');
    if (phase > 2) stroke(g,'#ffe79c',1.7,'24 -82/28 -73/25 -70/30 -64');
  }
}

// Ozzaroth is a cephalopod monarch suspended inside a split, horned mantle.
function drawTyrant(g: G, state: string, phase: number, t: number): void {
  const wave = Math.sin(t * .075);
  ink(g,'#4e4866','-29 -49/-16 -54 -10 -42/-9 -27 -20 -20/-32 -12 -33 -6/-27 0 -37 -1/-47 -1 -44 -9/-43 -17 -35 -24/-25 -34 -29 -49',2.2);
  ink(g,'#705573','12 -51/31 -56 36 -40/38 -25 44 -23/52 -20 56 -11/54 -6 49 -9/43 -17 37 -15/27 -14 24 -29/22 -37 15 -36',2.2);
  g.save();
  g.translateCanvas(2,-32);
  g.rotateCanvas(wave*.09);
  ink(g,'#9b6d92','-17 -9/-2 -13 7 -5/14 6 6 15/-2 23 3 26/6 28 14 21/17 21 16 25/12 34 2 32/-11 31 -10 20/-10 15 -5 9/1 1 -10 0/-19 0 -17 -9',2);
  stroke(g,'#dfaba8',1.6,'-1 4/5 10 -3 18/-10 30 2 29');
  g.restore();
  g.translateCanvas(0,wave * 1.65);
  ink(g,'#825e8d','-36 -83/-28 -99 -6 -97/13 -103 29 -91/51 -78 42 -53/38 -44 31 -40/27 -24 17 -18/17 -27 14 -31/13 -21 5 -15/1 -25 -7 -28/-13 -20 -22 -19/-18 -29 -22 -32/-43 -39 -42 -55/-45 -70 -36 -83',2.7);
  ink(g,'#634663','-42 -55/-31 -47 -24 -51/-20 -43 -11 -44/0 -43 4 -51/18 -49 23 -62/40 -58 43 -69/45 -51 32 -42/29 -29 20 -23/20 -35 14 -37/10 -25 6 -20/0 -33 -8 -33/-11 -26 -18 -24/-15 -34 -23 -37/-38 -40 -42 -55',0);
  // Sweeping horns form a crescent around the unblinking central eye.
  ink(g,'#405465','-35 -67/-43 -73 -49 -85/-53 -96 -47 -109/-43 -115 -39 -118/-43 -103 -35 -96/-31 -92 -21 -92/-12 -106 2 -108/15 -110 21 -99/32 -96 41 -104/47 -110 48 -120/56 -108 51 -93/50 -81 37 -72/39 -58 31 -53/27 -62 21 -64/14 -59 8 -58/12 -71 4 -76/-6 -81 -17 -72/-21 -65 -26 -62/-27 -68 -35 -67',2.5);
  ink(g,'#82b8b0','-45 -106/-44 -91 -28 -85/-38 -86 -43 -90/-48 -97 -45 -106',0);
  ink(g,'#9ed4c2','26 -91/44 -93 49 -110/50 -99 42 -91/35 -84 27 -83',0);
  stroke(g,'#adcab9',1.6,'-17 -88/-7 -101 5 -101');
  stroke(g,'#283443',1.6,'20 -91/33 -82 31 -68');
  ink(g,'#d9afaf','-34 -71/-24 -84 -11 -84/1 -88 12 -79/18 -73 17 -65/20 -55 10 -45/6 -42 3 -35/-3 -44 -10 -40/-15 -34 -24 -35/-21 -42 -26 -44/-38 -45 -39 -58/-39 -65 -34 -71',2);
  ink(g,'#af858e','-36 -55/-27 -48 -15 -54/-7 -56 0 -52/6 -51 14 -60/18 -55 9 -47/4 -43 3 -40/-2 -46 -10 -44/-16 -38 -20 -38/-19 -45 -25 -46/-35 -46 -36 -55',0);
  bossEye(g,-11,-66,1.88,phase>2?'#ffb98b':'#a6efe2',state==='sleep');
  stroke(g,'#715569',1.8,'-29 -67/-22 -83 -7 -80/4 -81 10 -71');
  const open = state === 'volley' || state === 'summon';
  ink(g,'#4a374e',open?'-29 -48/-18 -54 -5 -50/-4 -46 -11 -40/-21 -38 -29 -48':'-29 -48/-17 -51 -6 -49/-11 -45 -19 -45/-24 -44 -29 -48',1.2);
  ink(g,'#ffe6bf','-23 -49/-18 -50/-20 -44',.8);
  ink(g,'#ffe6bf','-12 -50/-8 -50/-11 -45',.8);
  g.save();
  g.translateCanvas(19,-52);
  g.rotateCanvas(wave*.07 - (state==='summon'?.30:0));
  ink(g,'#a67596','3 -8/15 -9 18 3/22 16 11 24/2 32 9 38/15 42 22 34/25 34 24 40/17 52 5 49/-7 46 -7 33/-7 25 2 16/8 9 0 4/-5 2 -4 -3');
  stroke(g,'#e1b1ba',1.7,'5 19/-5 28 -2 38/2 50 14 44');
  for (const [x,y] of [[9,8],[9,13],[5,18]]) oval(g,x,y,1.8,1.05,'#ecd2b9',INK,.7,-.6);
  g.restore();
  for (let i=0; i<phase; i++) {
    const x=2+i*6, y=-94+i*3;
    oval(g,x,y,1.9,3.4,phase===3?'#ffbf94':'#b4eed5',INK,1,-.3);
  }
}

export function drawBoss(g: G, o: ObstacleView, m: MobView | undefined, t: number): void {
  const final = m?.variant === 1, state = m?.state ?? 'sleep', phase = m?.phase ?? 1;
  const x = o.wx + o.w / 2, base = o.y + o.h, dir = m?.dir || -1;
  const attacking = state === 'volley' || state === 'summon';
  const jitter = state === 'charge' ? Math.sin(t * 1.35) * 1.8 : 0;
  oval(g,x,base+1,o.w*.46,4,'#15162677');
  if (state === 'charge') dashed(g,'#ffaa97ce',2.1,x+dir*o.w*.45,base-18,x+dir*(o.w*.5+154),base-18,9,6);
  g.save();
  g.translateCanvas(x+jitter,base);
  g.scaleCanvas(-dir,1);
  if (final) drawTyrant(g,state,phase,t);
  else drawWarden(g,state,phase,t);
  if (attacking) {
    const charge = Math.min(1, (m?.t ?? 0) / 30);
    glowOval(g,-24,final?-48:-46,4,3,'#ffa090',4+charge*4,.25+charge*.3,3);
  }
  if (state==='dash') for (let i=0;i<3;i++) line(g,'#f9b9ab',1.7,[[o.w*.45,-68+i*21],[o.w*.65+i*5,-70+i*21]]);
  if ((state==='phase' || (m?.invuln ?? 0)>6) && t%8<4) {
    oval(g,0,-o.h*.5,o.w*.54,o.h*.54,'#fff7da23','#ffe7c0b0',1.8);
  }
  g.restore();
  if (state === 'sleep') return;
  const width = o.w * .9, left = x-width/2, top = o.y-20;
  rect(g,INK,left-2,top-2,width+4,8);
  rect(g,'#63424c',left,top,width,4);
  rect(g,final?'#a8e9d2':'#ffc09a',left,top,width*Math.max(0,o.hp/o.maxHp),4);
  for (const n of [1,2]) rect(g,INK,left+width*n/3,top,1.5,4);
}
