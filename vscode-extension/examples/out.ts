import A from 'module';
import {B, C as D} from "module2";
import{
 B,
 C as D,}
from "module2";
import * as E from 'module3';

const x:number=3;
const xx=undefined||string;
xx = "test" || undefined;
const y="str";

function a(){
 return 5;
}
async function a(){
 return await 5;
}
function b(arg: any, x: number |  something) : number{
 return 5;
}
function b(
 arg: any,
 x: number |  something,
) : number{
 return 5;
}
function b(
 arg: any,
 x: number |  something,
){
 return 5;
}

if(x == 3){
 x = 4;
}
if(x > 3)x++;

if(done(a,b))proceed();

if(done(a,b)){
 proceed();
}
if(done( a,b)){
 proceed();
}
if((done( a,b)))proceed();

if(done(
 a,
 b
 )){
 proceed();
}
let data=[] as any;

let x2={3: 4} as any;
const sta={a:1,b:2, c: {d: 3, [x2]: {f: 4}}};
const sto={
 a: 1,
 b: 2,
 c: {
  d: 3,
  [x2]: {f: 4},
 },
};

type x ={
 z: number,
 x: ((arg1:number, arg2:string) =>number) |  string,
 g: number |  string,
 a: (x) =>number,
 b: (x:number) =>void |  string,
 c: () =>void,
};
(data[3]?.test as any)!.a++ + (4 as number);

const str:string="test";

type myFunc = (a: number, b: number) =>number |  string;



const arr:number[]|undefined;
const sa:[number,string]=[3,"test"];

arr?.[1] as number &   {test: number};
arr![1];

const lala=<T>():T=>{
 return {} as T;
};
const lala2=<T>()=>({})as T;


function sdf(t: '3' |  {x: number}) : void
function sdf(a: number, b: number) : number
function sdf(a: any, b?: any){
 return 123;
}
sdf({x:42});
sdf( {x:42});
sdf( '3');
sdf( 5, 8);

const select=(t:'a'| 'b' |  3)=>'x'+t;
select(3);

const lala3=<T extends Record<string,number>>(x:T): T=>{
 return {} as T;
};
const rest=(...args:number[])=>{
 return args.reduce((a, b)=>a+ b);
};
let i:any= 3;
i = i=3, i==4;

for(const x in arr)console.log(x);
for(const x:number|string of arr)console.log(x);

for(i=0;i<10;i++)console.log( i);
for(const i=0;i<10;i++)console.log(i);

abstract class X<T extends Record<number,any>> extends Array<T>{
 arg: number
 constructor(...args: T[]){super(...args)}
 method() : void{}
 abstract abstractMethod() : void
 get length() : number{
  return super.length;
}}
interface Something extends X<Record<number, string>>{
 a: number
 b: string
 c() : void
}
const XXXX=class name<S,T>{
 constructor(){return{}}
};
new XXXX<number,string>();

const text=`This ${lala(2,(3 as number))}${`works`}`;

enum E2 {
 A = 0,
 B = 42,
 C = 43,
}
enum E3 {A = 0,B = 42,C = 43}

enum Direction {
 Up = 0,
 Down = 1,
 Left = 2,
 Right = 3,
}
const day:number=1;
switch(day){case
 1:
  console.log("It is a Monday.");break;case
 0+a() as any:
  console.log("It is a Sunday.");break;
 default:console.log("It's a day");break;case
 2:console.log("It is a Tuesday.");break;
}
function templatedFunc<A>(): A |  A[]{
 return [];
};

templatedFunc<number |  string>;
templatedFunc<number |  string>();
(3+4)<test |  sdf>(x)<A>();


(3 + 4) < test || sdf > x;

test`string ${text as number} ${3 as number}`;

test`string`(text as number);



const result=x^      y &        z |       ~        123 <<          2;