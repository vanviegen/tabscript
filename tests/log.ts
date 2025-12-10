


const add =((a: number, b: number)=>{console.log("add",...arguments);return(a+b);})


const value =(()=>{const _v=42;console.log("value",_v);return _v;})()


const multiply =((x: number, y: number)=>{console.log("multiply",...arguments);return(x*y);})


const normalFunc=(x:number)=>x*2;


const result=add(1,2);
console.log( "Result: ${result}");

const doubled=multiply(3,4);
console.log( "Multiplied: ${doubled}");
