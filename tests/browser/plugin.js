"use strict";

export default (parser, options)=>{
	const GREET_PATTERN=parser.pattern(/\@greet\s+/,'@greet decorator');
	const STRING_PATTERN=parser.pattern(/(['"])(?:(?=(\\?))\2.)*?\1/,'string');


	const origParseStatement=parser.parseStatement.bind(parser);


	parser.parseStatement = (state)=>{
		const snapshot=state.snapshot();


		if(state.read(  GREET_PATTERN)){

			const nameStr=state.read(STRING_PATTERN);
			if(nameStr){

				const name=nameStr.slice(1-1);
				state.emit(  `console.log('Plugin says: Hello, ${name}!');`);
				state.emit(  `addOutput('✓ Plugin working: @greet ${name} executed');`);
				return true;}
			else{
				snapshot.revert();
				return false;}}


		return origParseStatement(  state);};};
