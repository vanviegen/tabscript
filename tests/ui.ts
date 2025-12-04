
const A={}as any;


A(`div`);


A(`main.my-class`);


A(`div.row.active`);


A(`input type=text placeholder=`,"Enter text");


const x=3;
A(`input value=`,x);


A(`div color:red`);


A(`div margin-top:10px`);


const array=[1,2,3];
const size=12;
A(`div.row margin-top:`,`${size*2}px`,function(){
	A(`input type=text value=`,x,`placeholder=`,"Enter text");
	A(`button color:red#Submit`);
});

const variable="world";
A(`#Some text ${variable} more text`);


A(function(){
	console.log( "do reactive things");
});

A(`.some-class`);


A(`.another-class fontSize:32`);


for(const item of array){
	A(`div.row`,function(){
		A(`span#Item #${item.id}: ${item.name}`);
});
}
A(`div span#Text`);


A(`input type=text name=username placeholder=`,"Your name",` color:blue fontSize:14px`);

A(`input value=`,true,`placeholder=`,`Test${42}`);

const tag="d"+"iv";
A(``,`${tag}`,`#T${'e'+'x'}t`);

A(`div span b#Hi mom`);

A(`div span b`,function(){
	A(`#Hi dad`);
});

A(`div#Text with \"quotes\" and 'apostrophes'`);


A(`input placeholder=`,"Enter \"quoted\" text");


A(`div title=`,"This is a title");


A(`div.container color:red span fontSize:12px#Nested text`);


const y=123;
A(`input value=`,x+y* 2);


A(`input placeholder=`,"");


A(`div.header.active`);


A(`div.my-very-long-class-name-here margin-top:10px padding-left:20px`);


A(`div#Hello 世界 🌍`);


A(`span#Use \`<code>\` :span $here`);


A(`input placeholder=`,'Enter text');


const count=5;
A(`span#Count: ${count}`);


A(`div.outer span.inner b.bold#Text`);


A(`div id=main span class=text#Content`);


A(`.item color:blue`);


A(`div`,function(){
	A(`span.label#Label:`);
	const val=123;
	A(`input type=text value=`,val);
});

A(`div span#Inline`);
A(`div`,function(){
	A(`span#Block child`);
});

const something=true;
A(`div`,function(){
	if(something){
		A(`.myclass`);}
	A(`id=test`);
	A(`data-value=`,`${"x "+"y"}`);
	A(`data-value2=`,"x "+"y");
	A(`click=`,()=>{
		console.log( "Clicked");});
	A(`destroy=`,()=>{
		console.log( "Destroyed");});
	const x=42;
	A(`value=`,x);});
