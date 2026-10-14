#!/usr/bin/env python3
"""Capture upstream HTTP fixtures against a separately started, disposable server.

Writes only when --seed-isolated is supplied. Never target a user's database.
The output contains public synthetic fixture data only.
"""
import argparse,json,time,urllib.request,urllib.error
from datetime import date
from pathlib import Path

COMMIT='c72e64f0c7e480f3d125f071659d5e3ad7b8da15'

def typed(v):
    if v is None:return 'null'
    if isinstance(v,bool):return {'bool':v}
    if isinstance(v,int):return {'i64':v}
    if isinstance(v,float):return {'f64':v}
    if isinstance(v,str):return {'string':v}
    if isinstance(v,list):return {'array':[typed(x) for x in v]}
    raise TypeError(v)
def prop(p):return {'property':p}
def val(v):return {'constant':typed(v)}
def pred(op,**kw):return {op:kw}
def wrap(op,input,**kw):return {op:{'input':input,**kw}}
def entry(name,root):return {'query':{'name':name,'root':root}}
def batch(entries,kind='read',returns=None):
    return {'request_type':kind,'query':{kind:{'entries':entries,'returns':returns if returns is not None else [e['query']['name'] for e in entries]}}}
def source(kind='nodes'):return {kind:{'reference':'all'}}
def inject(name):return {'inject':{'variable':name}}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--endpoint',default='http://127.0.0.1:17696/v2/query');ap.add_argument('--seed-isolated',action='store_true');ap.add_argument('--output',type=Path,default=Path(__file__).with_name('conformance.json'));a=ap.parse_args()
    fixtures=[]
    def call(name,body,path=None,headers=None,success=True):
        encoded=json.dumps(body,separators=(',',':')).encode();req=urllib.request.Request(path or a.endpoint,data=encoded,headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with urllib.request.urlopen(req,timeout=30) as r: status=r.status;text=r.read().decode()
        except urllib.error.HTTPError as e:status=e.code;text=e.read().decode()
        try:response=json.loads(text)
        except json.JSONDecodeError:response=text
        fixtures.append({'name':name,'request':body,'headers':headers or {},'status':status,'response':response,'responseText':text})
        if success and status!=200:raise RuntimeError(f'{name}: {status}: {text}')
        return response
    if not a.seed_isolated:raise SystemExit('Pass --seed-isolated only for a freshly started disposable server.')
    if not a.endpoint.startswith('http://127.0.0.1:17696/'):raise SystemExit('This fixture runner only seeds the isolated 127.0.0.1:17696 server.')
    empty=call('verify-empty-isolated-server',batch([entry('nodes',wrap('count',source())),entry('edges',wrap('count',source('edges')))]))
    if empty!={'nodes':0,'edges':0}:raise SystemExit('Refusing to seed a nonempty server; start a fresh isolated in-memory process.')
    fixtures.clear()
    node_specs=[('alice',{'name':'Alice','age':31,'status':'active','score':2,'optional':None,'id':'stored-id','label':'stored-label','source':'stored-source','target':'stored-target','large':9007199254740993}),('bob',{'name':'Bob','age':31,'status':'active','score':1,'optional':'present'}),('carol',{'name':'Carol','age':28,'score':2})]
    entries=[entry(name,{'add_n':{'label':'User','properties':[[p,{'value':typed(v)}] for p,v in props.items()]}}) for name,props in node_specs]
    for name,target in [('ab','bob'),('ab_parallel','bob'),('ac','carol'),('aa','alice')]:
        entries.append(entry(name,{'add_e':{'input':{'nodes':{'reference':{'var':'alice'}}},'label':'FOLLOWS','to':{'var':target},'properties':[['weight',{'value':{'i64':1}}]]}}))
    seeded=call('seed-isolated',batch(entries,'write'))
    ids={n:seeded[n][0]['$id'] for n,_ in node_specs};eids={n:seeded[n][0]['$id'] for n in ['ab','ab_parallel','ac','aa']}
    call('count',batch([entry('node_count',wrap('count',source())),entry('edge_count',wrap('count',source('edges')))]))
    pp=[('eq',pred('eq',left=prop('age'),right=val(31))),('neq',pred('neq',left=prop('age'),right=val(31))),('gt',pred('gt',left=prop('age'),right=val(28))),('gte',pred('gte',left=prop('age'),right=val(31))),('lt',pred('lt',left=prop('age'),right=val(31))),('lte',pred('lte',left=prop('age'),right=val(28))),('between',pred('between',value=prop('age'),min=val(28),max=val(31))),('has_key',pred('has_key',property='optional')),('is_null',pred('is_null',property='optional')),('is_not_null',pred('is_not_null',property='optional')),('starts_with',pred('starts_with',value=prop('name'),prefix=val('Al'))),('ends_with',pred('ends_with',value=prop('name'),suffix=val('ob'))),('contains',pred('contains',value=prop('name'),substring=val('aro'))),('is_in',pred('is_in',value=prop('age'),values=val([28,31]))),('and',pred('and',predicates=[pred('gte',left=prop('age'),right=val(30)),pred('eq',left=prop('status'),right=val('active'))])),('or',pred('or',predicates=[pred('eq',left=prop('name'),right=val('Alice')),pred('eq',left=prop('name'),right=val('Carol'))])),('not',pred('not',predicate=pred('eq',left=prop('name'),right=val('Alice')))),('eq_null',pred('eq',left=prop('optional'),right=val(None))),('id',pred('eq',left=prop('$id'),right=val(ids['alice'])))]
    for name,p in pp:
        call('predicate-'+name,batch([entry('source',wrap('id',{'nodes_where':{'predicate':p}})),entry('filter',wrap('id',wrap('where',source(),predicate=p)))]))
    call('edge-endpoint-paths',batch([entry('edge',wrap('project',source('edges'),projections=[{'property':{'source':p,'alias':p}} for p in ['$id','$label','$from','$to','$from.$id','$to.name']])),entry('filtered',wrap('id',{'edges_where':{'predicate':pred('eq',left=prop('$to.name'),right=val('Bob'))}}))]))
    start={'nodes':{'reference':{'ids':[ids['alice']]}}}
    for op in ['out','in','both','out_e','in_e','both_e']:
        call('traversal-'+op,batch([entry('rows',wrap('id',wrap(op,start,label='FOLLOWS')))]))
    for op in ['out_n','in_n','other_n']:
        call('traversal-'+op,batch([entry('rows',wrap('id',wrap(op,{'edges':{'reference':{'ids':[eids['ab']]}}})))]))
    ordered=wrap('order_by_multiple',source(),orderings=[['score','asc'],['age','desc'],['name','desc']])
    call('order-and-pagination',batch([entry('ordered',wrap('project',ordered,projections=[{'property':{'source':p,'alias':p}} for p in ['$id','name','score','age']])),entry('paged',wrap('id',wrap('limit',wrap('skip',ordered,count={'literal':1}),count={'literal':1}))),entry('groups',wrap('group_count',source(),property='status'))]))
    selected=wrap('order_by_multiple',source(),orderings=[['age','desc'],['name','desc']]);dup=wrap('inject',inject('selected'),variable='selected')
    call('materialized-association',batch([entry('selected',selected),entry('duplicates',dup),entry('ids',wrap('id',inject('duplicates'))),entry('properties',wrap('value_map',inject('duplicates'))),entry('labels',wrap('label',inject('duplicates'))),entry('dedup',wrap('id',wrap('dedup',inject('duplicates')))),entry('selected_edges',wrap('order_by',source('edges'),property='$id',order='desc')),entry('edge_ids',wrap('id',inject('selected_edges'))),entry('edge_properties',wrap('value_map',inject('selected_edges'))),entry('sources',wrap('id',wrap('in_n',inject('selected_edges')))),entry('targets',wrap('id',wrap('out_n',inject('selected_edges'))))]))
    call('empty-and-u64-source-acceptance',batch([entry('missing_one',{'nodes':{'reference':{'ids':[18446744073709551615]}}}),entry('missing_ids',wrap('id',{'nodes':{'reference':{'ids':[9223372036854775808]}}})),entry('missing_many',{'nodes_where':{'predicate':pred('eq',left=prop('$label'),right=val('Missing'))}}),entry('bounded_empty',wrap('limit',{'nodes_where':{'predicate':pred('eq',left=prop('$label'),right=val('Missing'))}},count={'literal':1})),entry('zero',wrap('count',{'nodes_where':{'predicate':pred('eq',left=prop('$label'),right=val('Missing'))}}))]))
    call('read-requires-writer',batch([entry('count',wrap('count',source()))]),headers={'X-Helix-Require-Writer':'true'})
    call('read-rejects-await-durable',batch([entry('count',wrap('count',source()))]),headers={'X-Helix-Await-Durable':'true'},success=False)
    call('mismatched-envelope',{'request_type':'read','query':{'write':{'entries':[],'returns':[]}}},success=False)
    call('flat-v2-rejection',{'request_type':'read','query':{'queries':[],'returns':[]}},success=False)
    call('schema-labels-and-bounded-fields',batch([entry('node_labels',wrap('group_count',source(),property='$label')),entry('edge_labels',wrap('group_count',source('edges'),property='$label')),entry('fields',wrap('value_map',wrap('limit',{'nodes_where':{'predicate':pred('eq',left=prop('$label'),right=val('User'))}},count={'literal':2})))]))
    call('describe-node-directed-details',batch([entry('node',{'nodes':{'reference':{'ids':[ids['alice']]}}}),entry('properties',wrap('value_map',inject('node'))),entry('degree',wrap('count',wrap('both_e',inject('node')))),entry('neighbors',wrap('id',wrap('limit',wrap('both',inject('node')),count={'literal':10}))),entry('incident',wrap('id',wrap('limit',wrap('both_e',inject('node')),count={'literal':10})))]))
    call('quoted-property-alias-projections',batch([entry('properties',wrap('project',source(),projections=[{'property':{'source':s,'alias':a}} for s,a in [('id','stored_id'),('label','stored_label'),('source','stored_source'),('target','stored_target'),('$id','id')]]))]))
    a.output.write_text(json.dumps({'upstreamCommit':COMMIT,'capturedOn':date.today().isoformat(),'deployment':'isolated in-memory native server on loopback; no Cloud gateway or v1 upstream server coverage','highIds':'full u64 source syntax accepted; nonexistent IDs only. No actual high-ID entities seeded. Source pin demonstrates virtual projection clamp.','seedNodeIds':ids,'seedEdgeIds':eids,'fixtures':fixtures},indent=2)+'\n');print(f'Captured {len(fixtures)} fixtures; node IDs {ids}; edge IDs {eids}')
if __name__=='__main__':main()
