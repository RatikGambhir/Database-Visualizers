#!/usr/bin/env python3
"""Synthetic writes only to fixed disposable loopback servers; never user settings."""
import argparse
import json
import urllib.request
import urllib.error
from pathlib import Path
from capture import batch, entry, wrap, source, inject, typed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--isolated', action='store_true', required=True)
    parser.add_argument('--base', action='store_true')
    args = parser.parse_args()
    endpoint = 'http://127.0.0.1:17698/v2/query' if args.base else 'http://127.0.0.1:17700/v2/query'
    captures = []
    def call(name, request, success=True):
        headers = {'Content-Type': 'application/json', 'X-Helix-Require-Writer': 'true'}
        if request['request_type'] == 'write': headers['X-Helix-Await-Durable'] = 'false'
        req = urllib.request.Request(endpoint, json.dumps(request).encode(), headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                status, body = response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read().decode()
        value = json.loads(body)
        captures.append(dict(name=name, request=request, headers=headers, status=status, response=value, responseText=body))
        if success and status != 200: raise RuntimeError((name, status, value))
        return status, value
    def counts(name): return call(name, batch([entry('nodes', wrap('count', source())), entry('edges', wrap('count', source('edges')))]))[1]
    def node(binding, label='User', **props): return entry(binding, {'add_n': {'label': label, 'properties': [[k, {'value': typed(v)}] for k,v in props.items()]}})
    def guard(name):
        value = entry(name + '_checked', inject(name))
        value['query']['condition'] = {'require_single_node': name}
        return value
    def edges(name, left, right): return entry(name, {'add_e': {'input': left, 'label': 'Follows', 'to': right, 'properties': []}})
    def ids(*values): return {'nodes': {'reference': {'ids': list(values)}}}
    def lookup(label): return wrap('where', source(), predicate={'eq': {'left': {'property': '$label'}, 'right': {'constant': {'string': label}}}})
    assert counts('empty') == {'nodes': 0, 'edges': 0}, 'Start a fresh isolated server'
    if args.base:
        call('missing-source-silently-commits-earlier-node', batch([node('created'), edges('edge', ids(999), {'var':'created'})], 'write'))
        assert counts('after-missing-source') == {'nodes': 1, 'edges': 0}
        call('multiple-bindings-fan-out', batch([node('a'), node('b'), entry('many', source()), edges('edges', inject('many'), {'var':'a'})], 'write'))
        assert counts('after-fanout') == {'nodes':3, 'edges':3}
    else:
        _, seeded = call('create-null-and-exact-properties', batch([node('alice', name='Alice', optional=None, large=9007199254740993), entry('props', wrap('value_map', inject('alice')))], 'write'))
        alice = seeded['alice'][0]['$id']
        assert seeded['props'][0]['optional'] is None
        assert seeded['props'][0]['large'] == 9007199254740993
        call('lookup-new-node-edge', batch([entry('alice', ids(alice)), guard('alice'), node('bob', name='Bob'), guard('bob'), edges('edge', inject('alice'), {'var':'bob'}), entry('ids', wrap('id', inject('edge'))), entry('source', wrap('id', wrap('in_n', inject('edge')))), entry('target', wrap('id', wrap('out_n', inject('edge'))))], 'write'))
        expected = counts('after-connected-graph')
        assert expected == {'nodes':2, 'edges':1}
        for name, lookup_root in [('missing-lookup', ids(999)), ('ambiguous-lookup', source())]:
            status, _ = call(name, batch([node('before', label='Temporary'), entry('found', lookup_root), guard('found')], 'write'), False)
            assert status != 200
            assert counts('rollback-' + name) == expected
        for side in ['source', 'target']:
            values = [node('before', label='Temporary'), entry('endpoint', ids(999)), guard('endpoint'), edges('edge', inject('endpoint') if side == 'source' else ids(alice), {'ids':[alice]} if side == 'source' else {'var':'endpoint'})]
            status, _ = call('missing-' + side, batch(values, 'write'), False)
            assert status != 200
            assert counts('rollback-' + side) == expected
        call('read-your-writes-and-self-loop', batch([node('new', label='Fresh'), entry('found', lookup('Fresh')), guard('found'), edges('self', inject('found'), {'var':'found'})], 'write'))
        assert counts('after-read-your-writes') == {'nodes':3, 'edges':2}
        call('parallel-edges', batch([entry('a', ids(alice)), guard('a'), edges('one', inject('a'), {'var':'a'}), edges('two', inject('a'), {'var':'a'})], 'write'))
        assert counts('after-parallel-edges') == {'nodes':3, 'edges':4}
    name = 'mutation-base-conformance.json' if args.base else 'mutation-extension-conformance.json'
    Path(__file__).with_name(name).write_text(json.dumps({'upstreamCommit':'c72e64f0c7e480f3d125f071659d5e3ad7b8da15', 'extension':None if args.base else 'atlas-mutation-v1', 'fixtures': captures}, indent=2)+'\n')
    print(f'{name}: {len(captures)} real HTTP captures')

if __name__ == '__main__': main()
