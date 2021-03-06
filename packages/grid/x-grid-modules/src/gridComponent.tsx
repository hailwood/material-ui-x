import * as React from 'react';
import { GridComponentProps } from './gridComponentProps';
import {
  useApiRef,
  useColumnResize,
  useComponents,
  usePagination,
  useSelection,
  useSorting,
} from './hooks/features';
import { DEFAULT_GRID_OPTIONS, ElementSize, GridOptions, RootContainerRef } from './models';
import { DATA_CONTAINER_CSS_CLASS, COMPONENT_ERROR } from './constants';
import { ColumnsContainer, DataContainer, GridRoot } from './components/styled-wrappers';
import { useVirtualRows } from './hooks/virtualization';
import {
  AutoSizerWrapper,
  ColumnsHeader,
  DefaultFooter,
  Viewport,
  OptionsContext,
  RenderContext,
  ApiContext,
  Window,
  Watermark,
  Pagination,
} from './components';
import { useApi, useColumns, useKeyboard, useRows } from './hooks/root';
import { useLogger, useLoggerFactory } from './hooks/utils';
import { debounce } from './utils';
import { mergeOptions } from './utils/mergeOptions';
import { useEvents } from './hooks/root/useEvents';
import { ErrorBoundary } from './components/error-boundary';

/**
 * Data Grid component implementing [[GridComponentProps]].
 *
 * @returns JSX.Element
 */
export const GridComponent: React.FC<GridComponentProps> = React.memo(
  ({ rows, columns, options, apiRef, loading, licenseStatus, className, components, error }) => {
    useLoggerFactory(options?.logger, options?.logLevel || DEFAULT_GRID_OPTIONS.logLevel);
    const logger = useLogger('Grid');
    const rootContainerRef: RootContainerRef = React.useRef<HTMLDivElement>(null);
    const footerRef = React.useRef<HTMLDivElement>(null);
    const columnsHeaderRef = React.useRef<HTMLDivElement>(null);
    const columnsContainerRef = React.useRef<HTMLDivElement>(null);
    const windowRef = React.useRef<HTMLDivElement>(null);
    const gridRef = React.useRef<HTMLDivElement>(null);
    const renderingZoneRef = React.useRef<HTMLDivElement>(null);
    const internalApiRef = useApiRef();
    const [errorState, setErrorState] = React.useState<any>(null);

    const [internalOptions, setInternalOptions] = React.useState<GridOptions>(
      mergeOptions(DEFAULT_GRID_OPTIONS, options),
    );
    React.useEffect(() => {
      setInternalOptions((previousState) => mergeOptions(previousState, options));
    }, [options]);

    if (!apiRef) {
      apiRef = internalApiRef;
    }

    const initialised = useApi(rootContainerRef, internalOptions, apiRef);

    const errorHandler = (args: any) => {
      // We are handling error here, to set up the handler as early as possible and be able to catch error thrown at init time.
      setErrorState(args);
    };
    React.useEffect(() => {
      return apiRef!.current.subscribeEvent(COMPONENT_ERROR, errorHandler);
    }, [apiRef]);

    React.useEffect(() => {
      apiRef!.current.showError(error);
    }, [apiRef, error]);

    useEvents(rootContainerRef, internalOptions, apiRef);
    const internalColumns = useColumns(internalOptions, columns, apiRef);
    const internalRows = useRows(internalOptions, rows, initialised, apiRef);
    useKeyboard(internalOptions, initialised, apiRef);
    useSelection(internalOptions, rows, initialised, apiRef);
    useSorting(internalOptions, rows, columns, apiRef);

    const renderCtx = useVirtualRows(
      columnsHeaderRef,
      windowRef,
      renderingZoneRef,
      internalColumns,
      internalRows,
      internalOptions,
      apiRef,
    );

    const onResizeColumn = useColumnResize(columnsHeaderRef, apiRef, internalOptions.headerHeight);
    const paginationProps = usePagination(internalRows, internalColumns, internalOptions, apiRef);

    React.useEffect(() => {
      setInternalOptions((previousState) => {
        if (previousState.pageSize !== paginationProps.pageSize) {
          return { ...previousState, pageSize: paginationProps.pageSize };
        }
        return previousState;
      });
    }, [paginationProps.pageSize, setInternalOptions]);

    const customComponents = useComponents(
      internalColumns,
      internalRows,
      internalOptions,
      components,
      paginationProps,
      apiRef,
      rootContainerRef,
    );

    const onResize = React.useCallback(
      (size: ElementSize) => {
        logger.info('resized...', size);
        apiRef!.current.resize();
      },
      [logger, apiRef],
    );
    const debouncedOnResize = React.useMemo(() => debounce(onResize, 100), [onResize]) as any;

    React.useEffect(() => {
      return () => {
        logger.info('canceling resize...');
        debouncedOnResize.cancel();
      };
    }, [logger, debouncedOnResize]);

    logger.info(
      `Rendering, page: ${renderCtx?.page}, col: ${renderCtx?.firstColIdx}-${renderCtx?.lastColIdx}, row: ${renderCtx?.firstRowIdx}-${renderCtx?.lastRowIdx}`,
      renderCtx,
    );

    const getTotalHeight = React.useCallback(
      (size) => {
        if (!internalOptions.autoHeight) {
          return size.height;
        }
        const footerHeight =
          (footerRef.current && footerRef.current.getBoundingClientRect().height) || 0;
        let dataHeight = (renderCtx && renderCtx.dataContainerSizes!.height) || 0;
        if (dataHeight < internalOptions.rowHeight) {
          dataHeight = internalOptions.rowHeight * 2; // If we have no rows, we give the size of 2 rows to display the no rows overlay
        }

        return footerHeight + dataHeight + internalOptions.headerHeight;
      },
      [
        internalOptions.autoHeight,
        internalOptions.headerHeight,
        internalOptions.rowHeight,
        renderCtx,
      ],
    );

    return (
      <AutoSizerWrapper onResize={debouncedOnResize} style={{ height: 'unset', width: 'unset' }}>
        {(size: any) => (
          <GridRoot
            ref={rootContainerRef}
            className={`material-grid MuiGrid ${className || ''}`}
            options={internalOptions}
            style={{ width: size.width, height: getTotalHeight(size) }}
            role="grid"
            aria-colcount={internalColumns.visible.length}
            aria-rowcount={internalRows.length + 1}
            tabIndex={0}
            aria-label="grid"
            aria-multiselectable={internalOptions.enableMultipleSelection}
          >
            <ErrorBoundary
              hasError={errorState != null}
              componentProps={errorState}
              api={apiRef!}
              logger={logger}
              render={(errorProps) => (
                <div className="main-grid-container">
                  {customComponents.renderError(errorProps)}
                </div>
              )}
            >
              <ApiContext.Provider value={apiRef}>
                <OptionsContext.Provider value={internalOptions}>
                  {customComponents.headerComponent}
                  <div className="main-grid-container">
                    <Watermark licenseStatus={licenseStatus} />
                    <ColumnsContainer ref={columnsContainerRef}>
                      <ColumnsHeader
                        ref={columnsHeaderRef}
                        columns={internalColumns.visible || []}
                        hasScrollX={!!renderCtx?.hasScrollX}
                        headerHeight={internalOptions.headerHeight}
                        onResizeColumn={onResizeColumn}
                        renderCtx={renderCtx}
                      />
                    </ColumnsContainer>
                    {!loading && internalRows.length === 0 && customComponents.noRowsComponent}
                    {loading && customComponents.loadingComponent}
                    <Window ref={windowRef}>
                      <DataContainer
                        ref={gridRef}
                        className={DATA_CONTAINER_CSS_CLASS}
                        style={{
                          minHeight: renderCtx?.dataContainerSizes?.height,
                          minWidth: renderCtx?.dataContainerSizes?.width,
                        }}
                      >
                        {renderCtx != null && (
                          <RenderContext.Provider value={renderCtx}>
                            <Viewport
                              ref={renderingZoneRef}
                              options={internalOptions}
                              rows={internalRows}
                              visibleColumns={internalColumns.visible}
                            />
                          </RenderContext.Provider>
                        )}
                      </DataContainer>
                    </Window>
                  </div>
                  {customComponents.footerComponent || (
                    <DefaultFooter
                      ref={footerRef}
                      paginationComponent={
                        !!internalOptions.pagination &&
                        paginationProps.pageSize != null &&
                        !internalOptions.hideFooterPagination &&
                        (customComponents.paginationComponent || (
                          <Pagination
                            setPage={paginationProps.setPage}
                            currentPage={paginationProps.page}
                            pageCount={paginationProps.pageCount}
                            pageSize={paginationProps.pageSize}
                            rowCount={paginationProps.rowCount}
                            setPageSize={paginationProps.setPageSize}
                            rowsPerPageOptions={internalOptions.rowsPerPageOptions}
                          />
                        ))
                      }
                      rowCount={
                        internalOptions.rowCount == null
                          ? internalRows.length
                          : internalOptions.rowCount
                      }
                      options={internalOptions}
                    />
                  )}
                </OptionsContext.Provider>
              </ApiContext.Provider>
            </ErrorBoundary>
          </GridRoot>
        )}
      </AutoSizerWrapper>
    );
  },
);

GridComponent.displayName = 'GridComponent';
