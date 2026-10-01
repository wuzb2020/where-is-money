// 支持外置引用图片的 Image：
// source.uri 为 idb://images/<ref>（web 端图片存 IndexedDB）时先异步 resolve 再渲染；
// 普通 data/blob/file/http URI 直接透传给原生 Image。
import React from 'react';
import { Image, View } from 'react-native';
import * as blobStore from '../../core/utils/blobStore';

export default function SmartImage({ source, placeholder = null, style, ...rest }) {
  const uri = source?.uri;
  const needResolve = !!uri && blobStore.isExternalRef(uri);
  const [resolved, setResolved] = React.useState(needResolve ? null : uri);

  React.useEffect(() => {
    let alive = true;
    if (uri && blobStore.isExternalRef(uri)) {
      blobStore.resolveImage(uri)
        .then((u) => { if (alive) setResolved(u); })
        .catch(() => { if (alive) setResolved(null); });
    } else {
      setResolved(uri);
    }
    return () => { alive = false; };
  }, [uri]);

  if (!resolved) {
    return placeholder || <View style={style} />;
  }
  return <Image {...rest} style={style} source={{ ...source, uri: resolved }} />;
}
