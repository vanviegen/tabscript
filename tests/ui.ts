
const A={}as any;


A.e(`div`);


A.e(`main`).c(`my-class`);


A.e(`div`).c(`row`).c(`active`);


A.e(`input`).a(`type`,`text`).a(`placeholder`,"Enter text");


const x=3;
A.e(`input`).p(`value`,x);


A.e(`div`).s(`color`,`red`);


A.e(`div`).s(`margin-top`,`10px`);


const array=[1,2,3];
const size=12;
A.e(`div`).c(`row`).s(`margin-top`,`${size*2}px`).f(function(){
	A.e(`input`).a(`type`,`text`).p(`value`,x).a(`placeholder`,"Enter text");
	A.e(`button`).s(`color`,`red`).t("Submit");
});

const variable="world";
A.t("Some text ${variable} more text");


A.f(function(){
	console.log( "do reactive things");
});

A.c(`some-class`);


A.c(`another-class`).s(`fontSize`,`32`);


for(const item of array){
	A.e(`div`).c(`row`).f(function(){
		A.e(`span`).t(`Item #${item.id}: ${item.name}`);
});
}
A.e(`div`).e(`span`).t("Text");


A.e(`input`).a(`type`,`text`).a(`name`,`username`).a(`placeholder`,"Your name").s(`color`,`blue`).s(`fontSize`,`14px`);

A.e(`input`).p(`value`,true).a(`placeholder`,`Test${42}`);

const tag="d"+"iv";
A.e(`${tag}`).t(`T${'e'+'x'}t`);

A.e(`div`).e(`span`).e(`b`).t("Hi mom");

A.e(`div`).e(`span`).e(`b`).f(function(){
	A.t("Hi dad");
});

A.e(`div`).t("Text with \"quotes\" and 'apostrophes'");


A.e(`input`).a(`placeholder`,"Enter \"quoted\" text");


A.e(`div`).a(`title`,"This is a title");


A.e(`div`).c(`container`).s(`color`,`red`).e(`span`).s(`fontSize`,`12px`).t("Nested text");


const y=123;
A.e(`input`).p(`value`,x+y * 2);


A.e(`input`).a(`placeholder`,"");


A.e(`div`).c(`header`).c(`active`);


A.e(`div`).c(`my-very-long-class-name-here`).s(`margin-top`,`10px`).s(`padding-left`,`20px`);


A.e(`div`).t("Hello 世界 🌍");


A.e(`span`).t("Use `<code>` :span $here");


A.e(`input`).a(`placeholder`,'Enter text');


const count=5;
A.e(`span`).t(`Count: ${count}`);


A.e(`div`).c(`outer`).e(`span`).c(`inner`).e(`b`).c(`bold`).t("Text");


A.e(`div`).a(`id`,`main`).e(`span`).a(`class`,`text`).t("Content");


A.c(`item`).s(`color`,`blue`);


A.e(`div`).f(function(){
	A.e(`span`).c(`label`).t("Label:");
	const val=123;
	A.e(`input`).a(`type`,`text`).p(`value`,val);
});

A.e(`div`).e(`span`).t("Inline");
A.e(`div`).f(function(){
	A.e(`span`).t("Block child");
});

const something=true;
A.e(`div`).f(function(){
	if(something){
		A.c(`myclass`);}
	A.a(`id`,`test`);
	A.a(`data-value`,`${40+ 2}`);
	A.l(`click`,()=>{
		console.log( "Clicked");});
	A.destroy(()=>{
		console.log( "Destroyed");});
	const x=42;
	A.p(`value`,x);});
