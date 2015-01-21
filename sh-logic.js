/**
 * Copyright 2015 Urbiworx.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
var vm = require('vm');
module.exports = function(RED) {
	var variables={};
	var formulas=new Array();
	var updater=null;
	var alldays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
	
    function ShlFormula(n) {
        RED.nodes.createNode(this,n);
		var that=this;
		this.state=null;
		this.formula=n.formula;
		this.calculate=function(){
			try{
				vm.runInNewContext("_result="+that.formula,variables);
				if (that.state!=variables._result){
					that.state=variables._result;
					that.send({payload:that.state});
				}
			} catch (e){;}
			delete (variables._result);
		}
		that.calculate();
		formulas[formulas.length]=this;
		this.on("close",function() {
			for(var i=0;i<formulas.length;i++){
				if (formulas[i]===this){
					formulas.splice(i,1);
				}
			}
		});
    }
    RED.nodes.registerType("SHL Formula",ShlFormula);
	
	function ShlVariable(n) {
        RED.nodes.createNode(this,n);
		var that=this;
		this.variable=n.variable;
		this.initial=n.initial;
		if (this.initial!=null){
			var scope={};
			vm.runInNewContext("var _result="+this.initial,scope);
			this.initial=scope._result;
		}
		this.reset=(typeof(n.reset)=="undefined"||n.reset=="")?null:parseInt(n.reset,10);
		this.delay=(typeof(n.delay)=="undefined"||n.delay=="")?null:parseInt(n.delay,10);
		var timer=null;
		function work(value){
			variables[that.variable]=value;
			if (timer!=null){
				clearTimeout(timer);
			}
			var updateFunction=function(callback){
				timer=null;
				for (var i=0;i<formulas.length;i++){
					formulas[i].calculate();
				}
				if (typeof(callback)!=="undefined"){
					callback();
				}
			};
			timer=setTimeout(updateFunction(function(){
			if (that.reset!=null){
				timer=setTimeout(function(){
					variables[that.variable]=that.initial;
					updateFunction();
				},that.reset<100?0:that.reset);
			}
			}),100);
		}
		if (this.initial!=null){
			work(this.initial);
		}
		this.on("input",function(msg) {
			if (that.delay!=null){
				setTimeout(function(){work(msg.payload)},that.delay);
			} else {
				work(msg.payload);
			}
		});
    }
    RED.nodes.registerType("SHL Variable",ShlVariable);
	
	function ShlCalendar(n) {
		this.state=null;
        RED.nodes.createNode(this,n);
		var that=this;
		this.attribs=n.attribs;
		this.calculate=function(){
			for (var i=0;i<that.attribs.length;i++){
				var rule=that.attribs[i];
				if (rule.days==null){
					continue;
				}
				
				if (rule.days.indexOf(alldays[new Date().getDay()])==-1){
						continue;
				}
				var context=null;
				var tempActive=true;
				if (rule.active!=="true"){
					context = vm.createContext(variables);
					vm.runInContext("_result="+rule.active,context);
					tempActive=context._result;
				}
				try{
					if (context==null){	
						context = vm.createContext(variables);
					}
					var date = new Date();
					var now=date.getHours()+":"+date.getMinutes();
					var from=rule.from.match(/[0-9]?[0-9]:[0-9][0-9]/g)?"'"+rule.from+"'":rule.from;
					var to=rule.to.match(/[0-9]?[0-9]:[0-9][0-9]/g)?"'"+rule.to+"'":rule.to;
					vm.runInContext("var from="+from+";var to="+to+";__result=(Date.parse('01/01/2011 '+from) <= Date.parse('01/01/2011 "+now+"')) && (Date.parse('01/01/2011 "+now+"') < Date.parse('01/01/2011 '+to))",context);
					//console.log(JSON.stringify(context)+" : "+(context._result==true));
					if (context.__result==true){
						vm.runInContext("___result="+rule.formula,context);
						//console.log(JSON.stringify(context));
						if (JSON.stringify(that.state)!=JSON.stringify(context.___result)){
							that.state=context.___result;
							that.send({payload:that.state});
						}
						break;
					}
				} catch (e){console.log(e);}
			}
		}
		var interval=setInterval(this.calculate,1000);
		this.on("close",function() {
			clearInterval(interval);
		});
    }
    RED.nodes.registerType("SHL Calendar",ShlCalendar);
}
