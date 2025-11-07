import{



	greet as getGreeting,
	answer,}
from './typescript';

import {ask as getQuestion, question} from './tabscript';

import * as E from './tabscript';

const x:number=3;
let xx:string|  undefined = undefined;
xx = "test";
const y="str";

function a(){
	return 5;
}
async function a2(){
	return await 5;
}
function b1(arg: any, x: number |  Something) : number{
	return 5;
}
function b2(
	arg: any,
	x: number |  Something,
) : number{
	return 5;
}
function b3(
	arg: any,
	x: number |  Something,
){
	return 5;
}
let num:3|  4 = 3;
if(num ===3){
	num = 4;
}
function assert(val: any): asserts val{
	if(!val){
		throw new Error("Value is not a string");
}
}
const three=Math.random()<0.5? '3' : 3;
assert( three == 3);
assert( three !==3);

let n=0;
if(n > 3)n++;

const done=(a:number,b:number): boolean=>{
	return a + b > 5;
};
const proceed=()=>{};
const rescue=()=>{};
const halt=()=>{
};
if(done(n, 2))proceed();

if(done(n, 2)){
	proceed();
}
if(done( n,2)){
	proceed();
}
if((done( n,2)))proceed();

if(done(
	n,
	2
	)){
	proceed();}
else if((done( n,n))){
	rescue();}
else{
	halt();
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
	a: (x: any) =>number,
	b: (x:number) =>void |  string,
	c: () =>void,
};
(data[3]?.test as any)!.a++ + (4 as number);

const str:string="test";

type myFunc = (a: number, b: number) =>number |  string;



let arr:number[]|  undefined;
const sa:[number,string]=[3,"test"];

arr?.[1] as number &   {test: number};
arr![1];

const lala=<T>():T=>{
	return {} as T;
};
const lala2=<T>()=>({})as T;


function sdf(t: '3' |  {x: number}) : void;
function sdf(a: number, b: number) : number;
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
i = i=3, i===4;

for(const x in arr)console.log(x);
for(const x2 of arr||[])console.log(x2);

for(i=0;i<10;i++)console.log( i);
for(let i=0;i<10;i++) console.log( i);

abstract class X<T extends Record<number,any>> extends Array<T>{
	arg: number = 123
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

const text=`This ${sdf(2,('3'as any as number))}${`works`}`;

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
switch(day){
	case 1: {
		console.log("It is a Monday.");break;}
	case 0+a()as any: {
		console.log("It is a Sunday.");break;}
	default: {console.log("It's a day");break;}
	case 2: {console.log("It is a Tuesday.");break;}
}
function templatedFunc<A>(): A |  A[]{
	return [];
};

templatedFunc<number |  string>;
templatedFunc<number |  string>();

const weirdFunc=<T>(x:number)=>{
	return <A>()=>{
		return new Date;
};};
const date=weirdFunc<number|string>(x)<Something>();


(3 + 4) < num || x > 2;

const test=(str:TemplateStringsArray,...args:any[])=>{
	console.log( str.join(", "),args.join(", "));
	return (arg: number)=>{
		console.log( arg);
};};
test`string ${x as number} ${3+4}`;

test`string`(x);



const result=x^      num &        42 |       ~        123 <<          2;

const isSet=x!=null;

type Handler = (event: Event)=>void;
type Mapper<T, U> = (input: T)=>U;
