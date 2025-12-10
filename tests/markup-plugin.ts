









import type {Parser, State, Register, Options, PluginOptions} from "file:///var/home/frank/projects/tabscript2/dist/tabscript.js";

const descr=(regexp:RegExp,name:string)=>{
	regexp.toString = ()=>'<'+ name + '>';
	return regexp;};


const TAG_LITERAL=descr(/[0-9a-zA-Z_\-]+/y,"tag-literal");
const TAG_LITERAL_INTERPOLATE=descr(/[0-9a-zA-Z_\-]*\$\{/y,"tag-literal");
const STRING=descr(/(['"])(?:(?=(\\?))\2.)*?\1/y,"string");


export default function createMarkupPlugin(register: Register, pluginOptions: PluginOptions, globalOptions: Options){
	const ui=pluginOptions.function||"$";


	const parseMarkupValue=(p:Parser,s:State, pendingSeparator: {value: string})=>{
		if(parseMarkupLiteral( p,s,pendingSeparator)){
			return true;}

		const snap=s.snapshot();
		s.emit( -1,'`,');
		if(p.parseBacktickString(s) || s.accept( STRING)){
			s.emit( -1,',`');

			if(pendingSeparator.value){
				s.emit( -1,pendingSeparator.value);
				pendingSeparator.value = '';}
			return true;}

		snap.revert();
		return false;};


	const parseMarkupLiteral=(p:Parser,s:State, pendingSeparator: {value: string})=>{
		const useArgString=s.peek(TAG_LITERAL_INTERPOLATE);

		if(useArgString){

			if(pendingSeparator.value){
				s.emit( -1,pendingSeparator.value);
				pendingSeparator.value = '';}
			s.emit( -1,'`,`');
			while(s.accept( TAG_LITERAL_INTERPOLATE)){
				s.must( p.parseExpression(s));
				s.must( s.accept( '}'));}}

		const hasTail=s.accept(TAG_LITERAL);

		if(useArgString){
			s.emit( -1,'`,`');}

		return useArgString || !!hasTail;};


	const parseMarkup=(p:Parser,s:State, uiLib: string)=>{
		if(!s.read( ':')){
			return false;}

		s.emit( uiLib + "(`");

		const startLine=s.inLine;
		const pendingSeparator={value:''};

		while(s.inLine ===startLine){
			if(s.read( '.')){

				if(pendingSeparator.value){
					s.emit( -1,pendingSeparator.value);
					pendingSeparator.value = '';}
				s.emit( '.');
				s.must( parseMarkupValue( p,s,pendingSeparator));
				continue;}


			const stringSnap=s.snapshot();
			if(s.accept(STRING) || p.parseBacktickString(s)){

				if(pendingSeparator.value){
					s.emit( -1,pendingSeparator.value);
					pendingSeparator.value = '';}
				const tokens=stringSnap.revertOutput();
				const str=tokens.filter((t)=>typeof t==='string').join('');
				const quote=str[0];
				let content=str.slice( 1,str.length - 1);
				if(quote !=='`'){
					content = content.replace( /`/g,'\\`');}
				s.emit( -1,"#" + content + "`,`");
				continue;}

			if(!parseMarkupLiteral( p,s,pendingSeparator)){
				break;}

			const op=s.accept('=')||s.accept(':');
			if(op){

				s.must( parseMarkupValue( p,s,pendingSeparator));
				pendingSeparator.value = ' ';}
			else if(s.read( '@')){


				if(pendingSeparator.value){
					s.emit( -1,pendingSeparator.value);
					pendingSeparator.value = '';}
				s.emit( '=');
				s.emit( -1,'`,');
				s.must( p.parseExpression(s));
				s.emit( -1,',`');
				pendingSeparator.value = '';}
			else{

				pendingSeparator.value = ' ';}}



		if(!s.outputEndsWith( '`')){
			s.emit( -1,'`,');}


		s.parseGroup( {jsOpen: 'function(){', jsClose: '}', next: ';', jsNext: null, allowImplicit: true},()=>s.recoverErrors(()=>p.parseStatement(s)));

		s.emit( ')');

		return true;};


	register.before( 'parseStatement',(p: Parser, s: State)=>{
		if(parseMarkup( p,s,ui)){
			s.emit( ';');
			return true;}
		return false;});};
